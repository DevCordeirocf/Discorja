import {
  randomInt,
  randomUUID,
  randomBytes,
  createHash,
  timingSafeEqual,
} from 'node:crypto';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import { isIP } from 'node:net';
import { WebSocket, WebSocketServer } from 'ws';
import {
  errorFields,
  sanitizeLogEvent,
  type LogEvent,
} from '../shared/logs.js';
import {
  parseClientMessage,
  ROOM_CODE_ALPHABET,
} from './message-validation.js';
import { adminPage } from './admin-page.js';
import { legacyAvatar } from '../shared/validation.js';
import { sniffImage } from '../shared/image-magic.js';
import {
  MAX_PAYLOAD,
  resolveSignalingConfig,
  type RateLimit,
  type SignalingOptions,
} from './config.js';
export type { RateLimit, SignalingOptions } from './config.js';
import type {
  ClientMessage,
  GroupRoom,
  ServerMessage,
  LegacyRoomState,
} from '../shared/protocol.js';

type Protocol = 1 | 2 | 3 | 4 | 5;
/** Groups one socket may follow, and distinct groups kept in memory. */
const MAX_GROUPS_PER_SOCKET = 8;
const MAX_GROUPS = 500;
const GROUP_STATE_DELAY_MS = 150;
/** Avatars are optional: skip them for receivers that are already backed up. */
const AVATAR_BUFFER_LIMIT = 256 * 1024;

interface Counter {
  start: number;
  count: number;
}
interface IpState {
  lastSeen: number;
  connections: Counter;
  messages: Counter;
  joins: Counter;
  groups: Counter;
}
interface Client {
  protocol: Protocol;
  watching: string | null;
  watchRequestId: string | null;
  id: string;
  socket: WebSocket;
  ip: string;
  ipState: IpState;
  alive: boolean;
  room?: Room;
  messages: Counter;
  joins: Counter;
  name: string;
  avatar: string;
  avatarId: string;
  profiles: Counter;
  avatarRequests: Counter;
  groupRequests: Counter;
  /** Group keys this socket follows, with the name shown as online. */
  groups: Map<string, string>;
  resumeToken: string;
  disconnectedAt?: number;
  invalidMessages: number;
  signals: Map<string, Counter>;
}
interface Room {
  logId: string;
  createdAt: number;
  protocol: Protocol;
  groupKey?: string;
  publications: Map<
    string,
    { publicationId: string; publisherId: string; audio: boolean }
  >;
  name: string;
  owner: Client;
  moderators: Set<string>;
  code: string;
  host: Client;
  hostName: string;
  viewers: Map<string, Client>;
  expiresAt: number;
  sharing: boolean;
}

/** Create an unbound HTTP/WebSocket service. The caller owns server.listen(port, host). */
export function createSignalingServer(options: SignalingOptions = {}): {
  server: Server;
  wss: WebSocketServer;
  close: () => Promise<void>;
} {
  const now = options.now ?? Date.now;
  let rejectedLogStart = now();
  let rejectedLogCount = 0;
  const log = (entry: LogEvent): void => {
    if (entry.event === 'room.rejected') {
      if (now() - rejectedLogStart >= 10_000) {
        rejectedLogStart = now();
        rejectedLogCount = 0;
      }
      if (++rejectedLogCount > 40) return;
    }
    const safe = sanitizeLogEvent(entry);
    if (safe) {
      try {
        options.onLog?.(safe);
      } catch {
        /* Logging must not interrupt rooms. */
      }
    }
  };
  const logRequest = (
    channel: 'http' | 'websocket' | 'websocket-message',
    operation: string,
    details: Record<string, unknown> = {},
  ): void => {
    log({
      event: 'request.received',
      details: { channel, operation, ...details },
    });
  };
  const {
    origins,
    maxViewers,
    maxPublishers,
    grace,
    statsHash,
    ttl,
    maxRooms,
    maxClients,
    maxTrackedIps,
    heartbeatMs,
    cleanupMs,
    limits,
    ipRetentionMs,
    trustProxyHops,
  } = resolveSignalingConfig(options);
  /**
   * Behind one trusted proxy the real address is the entry that proxy appended,
   * i.e. the rightmost one; anything to its left may be forged by the client.
   */
  const clientIp = (request: IncomingMessage): string => {
    const socketIp = request.socket.remoteAddress ?? 'unknown';
    if (!trustProxyHops) return socketIp;
    const header = request.headers['x-forwarded-for'];
    const forwarded = (
      Array.isArray(header) ? header.join(',') : (header ?? '')
    )
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .at(-1);
    return forwarded && isIP(forwarded) ? forwarded : socketIp;
  };
  const ips = new Map<string, IpState>();
  const clients = new Map<WebSocket, Client>();
  const rooms = new Map<string, Room>();
  const sessions = new Map<string, Client>();
  const statsRequests = new Map<string, Counter>();
  /** Group keys are SHA-256 hashes; the invite secret never reaches the server. */
  const groups = new Map<
    string,
    { subscribers: Set<Client>; rooms: Set<Room>; timer?: NodeJS.Timeout }
  >();
  const startedAt = now();
  const totals = { roomsCreated: 0, joins: 0, peakConnections: 0 };
  let closing = false;
  let closePromise: Promise<void> | undefined;
  const freshCounter = (): Counter => ({ start: now(), count: 0 });
  const consume = (counter: Counter, limit: RateLimit): boolean => {
    const time = now();
    if (time - counter.start >= limit.windowMs) {
      counter.start = time;
      counter.count = 0;
    }
    counter.count += 1;
    return counter.count <= limit.max;
  };
  const send = (client: Client, message: ServerMessage) => {
    // A stalled receiver must not turn the signaling relay into an unbounded output queue.
    if (client.socket.bufferedAmount > 1024 * 1024) {
      client.socket.terminate();
      return;
    }
    if (client.socket.readyState === WebSocket.OPEN)
      client.socket.send(JSON.stringify(message));
  };
  const error = (client: Client, code: string, message: string) => {
    log({
      event: 'room.rejected',
      details: { serverCode: code, roomId: client.room?.logId },
    });
    send(client, { type: 'error', code, message });
  };
  const members = (room: Room) => [room.host, ...room.viewers.values()];
  const digest = (value: string) =>
    createHash('sha256').update(value).digest('hex');
  /** Keeps only avatars the room's protocol can carry; the bytes are re-checked. */
  const acceptAvatar = (avatar: string | undefined, protocol: Protocol) => {
    if (!avatar) return '';
    if (protocol < 5) return legacyAvatar(avatar) ? avatar : '';
    const bytes = Buffer.from(avatar.slice(avatar.indexOf(',') + 1), 'base64');
    const image = sniffImage(bytes);
    return image && avatar.startsWith(`data:image/${image.type};`)
      ? avatar
      : '';
  };
  const setAvatar = (client: Client, avatar: string) => {
    client.avatar = avatar;
    client.avatarId = avatar ? digest(avatar).slice(0, 16) : '';
  };
  const groupState = (groupKey: string): ServerMessage | undefined => {
    const entry = groups.get(groupKey);
    if (!entry) return;
    const open = [...entry.rooms]
      .filter((room) => rooms.get(room.code) === room)
      .sort((a, b) => b.createdAt - a.createdAt);
    const listed: GroupRoom[] = open.slice(0, 20).map((room) => ({
      code: room.code,
      name: room.name,
      ownerName: room.owner.name,
      participants: members(room).length,
      maxParticipants: maxViewers + 1,
      publications: room.publications.size,
      members: members(room)
        .map((member) => member.name)
        .slice(0, 10),
    }));
    // People in the group's rooms count as online too: the app closes its
    // group listing while it shows a room. Nobody outside the group appears.
    const online = [
      ...new Set([
        ...[...entry.subscribers].map((subscriber) =>
          subscriber.groups.get(groupKey)!,
        ),
        ...open.flatMap((room) => members(room).map((member) => member.name)),
      ]),
    ].slice(0, 32);
    return { type: 'group-state', groupKey, rooms: listed, online };
  };
  /** Coalesces bursts (join, publish, profile) into one listing per group. */
  const scheduleGroupState = (groupKey: string | undefined) => {
    const entry = groupKey ? groups.get(groupKey) : undefined;
    if (!groupKey || !entry || entry.timer) return;
    entry.timer = setTimeout(() => {
      entry.timer = undefined;
      const message = groupState(groupKey);
      if (message)
        for (const subscriber of entry.subscribers) send(subscriber, message);
    }, GROUP_STATE_DELAY_MS);
    entry.timer.unref();
  };
  const pruneGroup = (groupKey: string) => {
    const entry = groups.get(groupKey);
    if (entry && !entry.subscribers.size && !entry.rooms.size) {
      clearTimeout(entry.timer);
      groups.delete(groupKey);
    }
  };
  const groupEntry = (groupKey: string) => {
    let entry = groups.get(groupKey);
    if (!entry && groups.size < MAX_GROUPS) {
      entry = { subscribers: new Set(), rooms: new Set() };
      groups.set(groupKey, entry);
    }
    return entry;
  };
  /**
   * Operator view behind the stats token. Codes are masked and no token,
   * resume token, group key or media detail is included.
   */
  const adminSnapshot = (connections: number) => {
    const activeRooms = [...rooms.values()];
    return {
      schemaVersion: 1,
      generatedAt: new Date(now()).toISOString(),
      uptimeMs: Math.max(0, now() - startedAt),
      connections,
      peakConnections: totals.peakConnections,
      participants: activeRooms.reduce(
        (sum, room) => sum + members(room).length,
        0,
      ),
      lobby: [...clients.values()].filter((client) => !client.room).length,
      totals: { roomsCreated: totals.roomsCreated, joins: totals.joins },
      limits: { maxRooms, maxClients, maxParticipants: maxViewers + 1 },
      rooms: activeRooms.map((room) => ({
        name: room.name,
        code: `${room.code.slice(0, 2)}••••••`,
        protocol: room.protocol,
        ageMs: Math.max(0, now() - room.createdAt),
        expiresInMs: Math.max(0, room.expiresAt - now()),
        inGroup: !!room.groupKey,
        participants: members(room).map((member) => ({
          name: member.name,
          role:
            member === room.owner
              ? 'owner'
              : room.moderators.has(member.id)
                ? 'moderator'
                : 'participant',
          connected: member.socket.readyState === WebSocket.OPEN,
          sharing:
            room.protocol >= 3
              ? room.publications.has(member.id)
              : room.host === member && room.sharing,
        })),
      })),
      groups: [...groups.values()].map((entry) => ({
        subscribers: entry.subscribers.size,
        rooms: entry.rooms.size,
      })),
    };
  };
  const unsubscribeGroup = (client: Client, groupKey: string) => {
    if (!client.groups.delete(groupKey)) return;
    groups.get(groupKey)?.subscribers.delete(client);
    scheduleGroupState(groupKey);
    pruneGroup(groupKey);
  };
  const roomState = (
    room: Room,
    target?: Client,
    reason: 'created' | 'joined' | 'resumed' | 'updated' = 'updated',
  ) => {
    if (room.protocol === 1) return;
    scheduleGroupState(room.groupKey);
    for (const member of target ? [target] : members(room)) {
      const snapshot: LegacyRoomState = {
        type: 'room-state',
        protocol: 2,
        reason,
        code: room.code,
        name: room.name,
        selfId: member.id,
        ownerId: room.owner.id,
        publisherId: room.host.id,
        sharing: room.sharing && room.host.socket.readyState === WebSocket.OPEN,
        maxParticipants: maxViewers + 1,
        resumeToken: member.resumeToken,
        participants: members(room).map((client) => ({
          peerId: client.id,
          name: client.name,
          ...(room.protocol === 4 && client.avatar
            ? { avatar: client.avatar }
            : room.protocol === 5 && client.avatarId
              ? { avatarId: client.avatarId }
              : {}),
          role:
            client === room.owner
              ? 'owner'
              : room.moderators.has(client.id)
                ? 'moderator'
                : 'participant',
          connected: client.socket.readyState === WebSocket.OPEN,
        })),
      };
      if (room.protocol === 2) send(member, snapshot);
      else {
        const ownPublication = room.publications.get(member.id);
        send(member, {
          ...snapshot,
          protocol: room.protocol as 3 | 4 | 5,
          maxPublishers,
          watching: member.watching,
          watchRequestId: member.watchRequestId,
          // Watchers inside the resume grace keep their WebRTC link, so the
          // publisher must not drop them while their socket reconnects.
          subscribers: ownPublication
            ? members(room)
                .filter(
                  (other) =>
                    other !== member &&
                    other.watching === ownPublication.publicationId,
                )
                .map((other) => other.id)
            : [],
          publications: [...room.publications.values()].map((publication) => ({
            ...publication,
            connected: members(room).some(
              (other) =>
                other.id === publication.publisherId &&
                other.socket.readyState === WebSocket.OPEN,
            ),
            watchers: members(room).filter(
              (other) => other.watching === publication.publicationId,
            ).length,
          })),
        });
      }
    }
  };
  const removePublication = (room: Room, publisherId: string) => {
    const publication = room.publications.get(publisherId);
    if (!publication) return;
    room.publications.delete(publisherId);
    for (const member of members(room)) {
      if (member.watching === publication.publicationId) member.watching = null;
      for (const key of member.signals.keys())
        if (key.startsWith(`${publication.publicationId}:`))
          member.signals.delete(key);
    }
  };
  const closeRoom = (
    room: Room,
    reason: 'host-left' | 'host-closed' | 'expired',
  ) => {
    if (!rooms.delete(room.code)) return;
    log({
      event: 'room.ended',
      details: {
        reason,
        roomId: room.logId,
        protocol: room.protocol,
        durationMs: Math.max(0, now() - room.createdAt),
        participants: room.viewers.size + 1,
      },
    });
    for (const member of [room.host, ...room.viewers.values()]) {
      sessions.delete(member.resumeToken);
      member.room = undefined;
      member.watching = null;
      member.signals.clear();
      send(member, { type: 'room-closed', reason });
    }
    room.viewers.clear();
    room.publications.clear();
    if (room.groupKey) {
      groups.get(room.groupKey)?.rooms.delete(room);
      scheduleGroupState(room.groupKey);
      pruneGroup(room.groupKey);
    }
  };
  const leave = (client: Client) => {
    sessions.delete(client.resumeToken);
    const room = client.room;
    if (!room) return;
    if (room.owner === client) {
      closeRoom(room, 'host-left');
      return;
    }
    client.room = undefined;
    room.moderators.delete(client.id);
    if (room.protocol >= 3) {
      removePublication(room, client.id);
      client.watching = null;
      client.signals.clear();
      for (const member of members(room))
        for (const key of member.signals.keys())
          if (key.includes(`:${client.id}:`)) member.signals.delete(key);
      room.viewers.delete(client.id);
      roomState(room);
      return;
    }
    if (room.protocol === 2) {
      if (room.host === client) {
        room.host = room.owner;
        room.viewers.delete(room.owner.id);
        room.sharing = false;
      } else room.viewers.delete(client.id);
      roomState(room);
      return;
    }
    if (room.viewers.delete(client.id))
      send(room.host, { type: 'viewer-left', peerId: client.id });
  };
  const expireRooms = () => {
    for (const room of rooms.values())
      if (now() >= room.expiresAt) closeRoom(room, 'expired');
    for (const client of sessions.values())
      if (
        client.disconnectedAt !== undefined &&
        now() - client.disconnectedAt >= grace
      )
        leave(client);
  };
  const server = createServer((request, response) => {
    const pathname = request.url?.split('?', 1)[0];
    const operation =
      pathname === '/health'
        ? 'health'
        : pathname === '/api/stats'
          ? 'stats'
          : pathname === '/api/admin'
            ? 'admin'
            : pathname === '/admin'
              ? 'admin-page'
              : 'not-found';
    response.once('finish', () =>
      logRequest('http', operation, {
        method: request.method,
        statusCode: response.statusCode,
      }),
    );
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    // The operator page is static; its data needs the token through /api/admin.
    if (request.url === '/admin' && statsHash) {
      if (request.method !== 'GET') {
        response.writeHead(405, { Allow: 'GET' });
        response.end();
        return;
      }
      const nonce = randomBytes(16).toString('base64');
      response.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'nonce-${nonce}'; connect-src 'self'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
        'Referrer-Policy': 'no-referrer',
        'X-Frame-Options': 'DENY',
      });
      response.end(adminPage(nonce));
      return;
    }
    if (
      (request.url === '/api/stats' || request.url === '/api/admin') &&
      statsHash
    ) {
      const ip = clientIp(request);
      let counter = statsRequests.get(ip);
      if (!counter) {
        if (statsRequests.size >= 1000) {
          response.writeHead(429);
          response.end();
          return;
        }
        counter = freshCounter();
        statsRequests.set(ip, counter);
      }
      if (!consume(counter, { max: 30, windowMs: 60_000 })) {
        response.writeHead(429, { 'Retry-After': '60' });
        response.end();
        return;
      }
      const auth = request.headers.authorization;
      const supplied =
        typeof auth === 'string' && auth.startsWith('Bearer ')
          ? auth.slice(7)
          : '';
      if (
        supplied.length > 256 ||
        !timingSafeEqual(
          createHash('sha256').update(supplied).digest(),
          statsHash,
        )
      ) {
        response.writeHead(401, { 'WWW-Authenticate': 'Bearer' });
        response.end();
        return;
      }
      if (request.method !== 'GET') {
        response.writeHead(405, { Allow: 'GET' });
        response.end();
        return;
      }
      expireRooms();
      const connected = [...clients.values()].filter(
        (c) => c.socket.readyState === WebSocket.OPEN,
      );
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      if (request.url === '/api/admin') {
        response.end(JSON.stringify(adminSnapshot(connected.length)));
        return;
      }
      response.end(
        JSON.stringify({
          schemaVersion: 1,
          scope: 'instance',
          websocketConnections: connected.length,
          participantSessions: connected.filter((c) => c.room).length,
          roomMemberships: connected.filter((c) => c.room).length,
          activeRooms: rooms.size,
          activeGroups: groups.size,
          reportedScreenPublishers: connected.filter((c) =>
            c.room && c.room.protocol >= 3
              ? c.room.publications.has(c.id)
              : c.room?.host === c && c.room.sharing,
          ).length,
          generatedAt: new Date(now()).toISOString(),
        }),
      );
      return;
    }
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(closing ? 503 : 200, {
        'Content-Type': 'application/json; charset=utf-8',
      });
      response.end(JSON.stringify({ status: closing ? 'closing' : 'ok' }));
      return;
    }
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Não encontrado.');
  });
  // Bound idle HTTP handshakes as well as accepted WebSocket clients.
  server.maxConnections = maxClients + 16;
  server.headersTimeout = 10_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 5_000;
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: MAX_PAYLOAD,
    perMessageDeflate: false,
  });
  server.on('upgrade', (request, socket, head) => {
    const reject = (status: string) => {
      const statusCode = Number.parseInt(status, 10);
      logRequest('websocket', 'handshake', { statusCode });
      socket.end(
        `HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
      );
    };
    const ip = clientIp(request);
    let ipState = ips.get(ip);
    if (!ipState) {
      if (ips.size >= maxTrackedIps) {
        reject('503 Service Unavailable');
        return;
      }
      ipState = {
        lastSeen: now(),
        connections: freshCounter(),
        messages: freshCounter(),
        joins: freshCounter(),
        groups: freshCounter(),
      };
      ips.set(ip, ipState);
    }
    ipState.lastSeen = now();
    if (!consume(ipState.connections, limits.ipConnections)) {
      reject('429 Too Many Requests');
      return;
    }
    if (closing || clients.size >= maxClients) {
      reject('503 Service Unavailable');
      return;
    }
    if (!request.headers.origin || !origins.has(request.headers.origin)) {
      reject('403 Forbidden');
      return;
    }
    if (request.url !== '/' && request.url !== '/ws') {
      reject('404 Not Found');
      return;
    }
    const acceptedIpState = ipState;
    wss.handleUpgrade(request, socket, head, (websocket) => {
      const client: Client = {
        protocol: 1,
        watching: null,
        watchRequestId: null,
        id: randomUUID(),
        socket: websocket,
        ip,
        ipState: acceptedIpState,
        alive: true,
        name: '',
        avatar: '',
        avatarId: '',
        profiles: freshCounter(),
        avatarRequests: freshCounter(),
        groupRequests: freshCounter(),
        groups: new Map(),
        resumeToken: randomBytes(32).toString('hex'),
        invalidMessages: 0,
        signals: new Map(),
        messages: freshCounter(),
        joins: freshCounter(),
      };
      clients.set(websocket, client);
      totals.peakConnections = Math.max(totals.peakConnections, clients.size);
      logRequest('websocket', 'handshake', { statusCode: 101 });
      wss.emit('connection', websocket, request);
    });
  });
  wss.on('connection', (socket) => {
    const client = clients.get(socket)!;
    socket.on('pong', () => {
      client.alive = true;
    });
    socket.on('error', (error) => {
      log({
        event: 'connection.error',
        details: { ...errorFields(error), roomId: client.room?.logId },
      });
    });
    socket.on('close', (code) => {
      log({
        event: 'connection.closed',
        details: { code, roomId: client.room?.logId },
      });
      clients.delete(socket);
      for (const groupKey of [...client.groups.keys()])
        unsubscribeGroup(client, groupKey);
      if (
        !closing &&
        grace &&
        client.room &&
        sessions.get(client.resumeToken) === client
      ) {
        client.disconnectedAt = now();
        if (client.room.protocol !== 1) {
          roomState(client.room);
          return;
        }
        if (client.room.host === client)
          for (const viewer of client.room.viewers.values())
            send(viewer, { type: 'host-state', sharing: false });
        else send(client.room.host, { type: 'viewer-left', peerId: client.id });
      } else leave(client);
    });
    socket.on('message', (data, isBinary) => {
      client.ipState.lastSeen = now();
      if (
        !consume(client.messages, limits.socketMessages) ||
        !consume(client.ipState.messages, limits.ipMessages)
      ) {
        logRequest('websocket-message', 'rate-limited', {
          clientProtocol: client.protocol,
          roomId: client.room?.logId,
        });
        error(
          client,
          'RATE_LIMITED',
          'Muitas mensagens. Aguarde antes de tentar novamente.',
        );
        leave(client);
        socket.close(1008, 'Limite de mensagens');
        return;
      }
      expireRooms();
      let message: ClientMessage | undefined;
      try {
        if (!isBinary)
          message = parseClientMessage(JSON.parse(data.toString()));
      } catch {
        /* Invalid JSON is rejected below. */
      }
      if (!message) {
        logRequest('websocket-message', 'invalid', {
          clientProtocol: client.protocol,
          roomId: client.room?.logId,
        });
        error(client, 'INVALID_MESSAGE', 'Mensagem inválida.');
        if (++client.invalidMessages >= 3) {
          leave(client);
          socket.close(1008, 'Protocolo inválido');
        }
        return;
      }
      logRequest('websocket-message', message.type, {
        clientProtocol:
          message.type === 'hello' ? message.protocol : client.protocol,
        roomId: client.room?.logId,
      });
      if (message.type === 'hello') {
        if (client.room || ![2, 3, 4, 5].includes(message.protocol)) {
          error(
            client,
            'PROTOCOL_MISMATCH',
            'Protocolo incompatível. Atualize aplicativo e servidor para versões compatíveis.',
          );
          return;
        }
        client.protocol = message.protocol as 2 | 3 | 4 | 5;
        // Groups belong to the newer protocol; leaving them keeps state consistent.
        if (client.protocol < 5)
          for (const groupKey of [...client.groups.keys()])
            unsubscribeGroup(client, groupKey);
        send(client, {
          type: 'hello',
          protocol: message.protocol as 2 | 3 | 4 | 5,
        });
        return;
      }
      if (
        message.type === 'subscribe-group' ||
        message.type === 'unsubscribe-group'
      ) {
        if (client.protocol < 5) {
          error(
            client,
            'PROTOCOL_MISMATCH',
            'Atualize o aplicativo e o servidor para usar grupos.',
          );
          return;
        }
        if (message.type === 'unsubscribe-group') {
          unsubscribeGroup(client, message.groupKey);
          return;
        }
        if (
          !consume(client.groupRequests, limits.socketGroups) ||
          !consume(client.ipState.groups, limits.ipGroups)
        ) {
          error(client, 'RATE_LIMITED', 'Aguarde antes de abrir outro grupo.');
          return;
        }
        if (
          !client.groups.has(message.groupKey) &&
          client.groups.size >= MAX_GROUPS_PER_SOCKET
        ) {
          error(
            client,
            'GROUP_LIMIT',
            `Acompanhe no máximo ${MAX_GROUPS_PER_SOCKET} grupos ao mesmo tempo.`,
          );
          return;
        }
        const entry = groupEntry(message.groupKey);
        if (!entry) {
          error(
            client,
            'SERVER_FULL',
            'O serviço está cheio. Tente novamente mais tarde.',
          );
          return;
        }
        client.groups.set(message.groupKey, message.name);
        entry.subscribers.add(client);
        const listing = groupState(message.groupKey);
        if (listing) send(client, listing);
        scheduleGroupState(message.groupKey);
        return;
      }
      if (message.type === 'resume-room') {
        if (
          !consume(client.joins, limits.socketJoins) ||
          !consume(client.ipState.joins, limits.ipJoins)
        ) {
          error(client, 'RATE_LIMITED', 'Aguarde antes de tentar novamente.');
          return;
        }
        const previous = sessions.get(message.token);
        const room = previous?.room;
        if (
          client.room ||
          !previous ||
          !room ||
          room.protocol !== client.protocol ||
          previous.disconnectedAt === undefined ||
          now() - previous.disconnectedAt >= grace ||
          previous.socket.readyState === WebSocket.OPEN
        ) {
          error(
            client,
            'RESUME_REJECTED',
            'Não foi possível retomar a sala. Entre novamente.',
          );
          return;
        }
        sessions.delete(previous.resumeToken);
        client.id = previous.id;
        client.name = previous.name;
        client.avatar = previous.avatar;
        client.avatarId = previous.avatarId;
        client.watching = previous.watching;
        client.watchRequestId = previous.watchRequestId;
        client.room = room;
        previous.room = undefined;
        const host = room.host === previous;
        if (host) room.host = client;
        else room.viewers.set(client.id, client);
        if (room.owner === previous) room.owner = client;
        sessions.set(client.resumeToken, client);
        if (room.protocol !== 1) {
          roomState(room, client, 'resumed');
          for (const member of members(room))
            if (member !== client) roomState(room, member);
          return;
        }
        send(client, {
          type: 'room-resumed',
          role: host ? 'host' : 'viewer',
          code: room.code,
          selfId: client.id,
          hostId: room.host.id,
          hostName: room.hostName,
          maxViewers,
          sharing: room.sharing,
          resumeToken: client.resumeToken,
          viewers: host
            ? [...room.viewers.values()]
                .filter((c) => c.socket.readyState === WebSocket.OPEN)
                .map((c) => ({ peerId: c.id, name: c.name }))
            : [],
        });
        if (host)
          for (const viewer of room.viewers.values())
            send(viewer, { type: 'host-state', sharing: room.sharing });
        else
          send(room.host, {
            type: 'viewer-joined',
            peerId: client.id,
            name: client.name,
          });
        return;
      }
      if (message.type === 'create-room' || message.type === 'join-room') {
        if (
          !consume(client.joins, limits.socketJoins) ||
          !consume(client.ipState.joins, limits.ipJoins)
        ) {
          error(
            client,
            'RATE_LIMITED',
            'Muitas tentativas de entrar em salas. Aguarde um minuto.',
          );
          return;
        }
        if (client.room) {
          error(
            client,
            'ALREADY_IN_ROOM',
            'Você já está em uma sala. Saia antes de entrar em outra.',
          );
          return;
        }
        if (message.type === 'create-room') {
          if (rooms.size >= maxRooms) {
            error(
              client,
              'SERVER_FULL',
              'O serviço está cheio. Tente novamente mais tarde.',
            );
            return;
          }
          if (message.groupKey && client.protocol < 5) {
            error(
              client,
              'PROTOCOL_MISMATCH',
              'Atualize o servidor para criar salas em grupos.',
            );
            return;
          }
          const group = message.groupKey
            ? groupEntry(message.groupKey)
            : undefined;
          if (message.groupKey && !group) {
            error(
              client,
              'SERVER_FULL',
              'O serviço está cheio. Tente novamente mais tarde.',
            );
            return;
          }
          let code = message.code ?? '';
          if (code && rooms.has(code)) {
            error(
              client,
              'ROOM_CODE_IN_USE',
              'Esse código já está sendo usado. Escolha outro ou gere um novo.',
            );
            return;
          }
          if (!code) {
            do {
              code = Array.from(
                { length: 8 },
                () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)],
              ).join('');
            } while (rooms.has(code));
          }
          const room: Room = {
            logId: randomUUID(),
            createdAt: now(),
            protocol: client.protocol,
            publications: new Map(),
            name: message.roomName ?? `Sala de ${message.name}`.slice(0, 40),
            owner: client,
            moderators: new Set(),
            code,
            host: client,
            hostName: message.name,
            viewers: new Map(),
            expiresAt: now() + ttl,
            sharing: false,
            ...(message.groupKey ? { groupKey: message.groupKey } : {}),
          };
          rooms.set(code, room);
          group?.rooms.add(room);
          totals.roomsCreated++;
          log({
            event: 'room.created',
            details: {
              roomId: room.logId,
              protocol: room.protocol,
              roomTtlMs: ttl,
            },
          });
          client.room = room;
          client.name = message.name;
          setAvatar(client, acceptAvatar(message.avatar, room.protocol));
          sessions.set(client.resumeToken, client);
          if (room.protocol !== 1) {
            roomState(room, client, 'created');
            return;
          }
          send(client, {
            type: 'room-created',
            code,
            selfId: client.id,
            maxViewers,
            resumeToken: client.resumeToken,
          });
          return;
        }
        const room = rooms.get(message.code);
        if (!room) {
          error(client, 'ROOM_NOT_FOUND', 'Sala não encontrada ou expirada.');
          return;
        }
        // A newer app joins an older room by speaking that room's protocol.
        if (client.protocol === 5 && room.protocol === 4) client.protocol = 4;
        if (room.protocol !== client.protocol) {
          error(
            client,
            'PROTOCOL_MISMATCH',
            room.protocol > client.protocol
              ? 'Esta sala foi criada em uma versão mais nova do Discorja. Atualize o aplicativo para entrar.'
              : 'Esta sala usa outra versão. Todos devem usar clientes compatíveis; crie uma nova sala após atualizar.',
          );
          return;
        }
        if (room.viewers.size >= maxViewers) {
          error(
            client,
            'ROOM_FULL',
            'Esta sala atingiu o limite de espectadores.',
          );
          return;
        }
        room.viewers.set(client.id, client);
        client.room = room;
        client.name = message.name;
        setAvatar(client, acceptAvatar(message.avatar, room.protocol));
        totals.joins++;
        sessions.set(client.resumeToken, client);
        if (room.protocol !== 1) {
          roomState(room, client, 'joined');
          for (const member of members(room))
            if (member !== client) roomState(room, member);
          return;
        }
        send(client, {
          type: 'room-joined',
          code: room.code,
          selfId: client.id,
          hostId: room.host.id,
          hostName: room.hostName,
          sharing: room.sharing,
          resumeToken: client.resumeToken,
        });
        send(room.host, {
          type: 'viewer-joined',
          peerId: client.id,
          name: message.name,
        });
        return;
      }
      const room = client.room;
      if (!room) {
        error(client, 'NOT_IN_ROOM', 'Você precisa entrar em uma sala.');
        return;
      }
      const isHost = room.host === client;
      const isOwner = room.owner === client;
      const canModerate = isOwner || room.moderators.has(client.id);
      switch (message.type) {
        case 'get-avatar': {
          // Avatars are best effort: anything unexpected is silently dropped.
          const target = members(room).find(
            (member) => member.id === message.peerId,
          );
          if (
            room.protocol !== 5 ||
            !target ||
            target.avatarId !== message.avatarId ||
            !target.avatar ||
            client.socket.bufferedAmount > AVATAR_BUFFER_LIMIT ||
            !consume(client.avatarRequests, limits.socketAvatars)
          )
            return;
          send(client, {
            type: 'participant-avatar',
            peerId: target.id,
            avatarId: target.avatarId,
            avatar: target.avatar,
          });
          break;
        }
        case 'update-profile': {
          if (room.protocol < 4) {
            error(
              client,
              'PROTOCOL_MISMATCH',
              'Esta sala não permite atualizar o perfil. Crie uma nova sala após atualizar o servidor.',
            );
            return;
          }
          if (!consume(client.profiles, limits.socketProfiles)) {
            error(
              client,
              'RATE_LIMITED',
              'Aguarde um pouco antes de alterar o perfil de novo.',
            );
            return;
          }
          // Each change is sent to every member, so skip no-op updates.
          const avatar = acceptAvatar(message.avatar, room.protocol);
          if (client.name === message.name && client.avatar === avatar) break;
          client.name = message.name;
          setAvatar(client, avatar);
          if (room.host === client) room.hostName = message.name;
          roomState(room);
          break;
        }
        case 'publish-state': {
          if (room.protocol < 3) {
            error(
              client,
              'PROTOCOL_MISMATCH',
              'Atualize o aplicativo para compartilhar várias telas.',
            );
            return;
          }
          const existing = room.publications.get(client.id);
          if (existing && existing.publicationId !== message.publicationId) {
            error(
              client,
              'STALE_PUBLICATION',
              'A transmissão já foi substituída.',
            );
            return;
          }
          if (message.sharing) {
            if (!existing && room.publications.size >= maxPublishers) {
              error(
                client,
                'PUBLICATION_LIMIT',
                'O limite de telas simultâneas desta sala foi atingido.',
              );
              return;
            }
            if (
              [...room.publications.values()].some(
                (publication) =>
                  publication.publicationId === message.publicationId &&
                  publication.publisherId !== client.id,
              )
            ) {
              error(
                client,
                'INVALID_PUBLICATION',
                'Identificador de transmissão indisponível.',
              );
              return;
            }
            room.publications.set(client.id, {
              publicationId: message.publicationId,
              publisherId: client.id,
              audio: message.audio,
            });
          } else removePublication(room, client.id);
          roomState(room);
          break;
        }
        case 'watch-publication': {
          if (room.protocol < 3) {
            error(
              client,
              'PROTOCOL_MISMATCH',
              'Atualize o aplicativo para escolher uma transmissão.',
            );
            return;
          }
          const publication = [...room.publications.values()].find(
            (entry) => entry.publicationId === message.publicationId,
          );
          if (
            message.publicationId !== null &&
            (!publication || publication.publisherId === client.id)
          ) {
            error(
              client,
              'PUBLICATION_NOT_FOUND',
              'Esta transmissão não está mais disponível.',
            );
            return;
          }
          // Retrying the same selection must also replace the publisher's old PC.
          // First revoke that send; the acknowledgement below precedes a fresh offer.
          // Only the publisher acts on the revocation, so only it gets the snapshot.
          if (
            message.publicationId !== null &&
            client.watching === message.publicationId
          ) {
            client.watching = null;
            const publisher = members(room).find(
              (member) => member.id === publication?.publisherId,
            );
            if (publisher) roomState(room, publisher);
          }
          client.watching = message.publicationId;
          client.watchRequestId = message.requestId;
          // Queue the acknowledgement before any publisher can generate a new offer.
          roomState(room, client);
          for (const member of members(room))
            if (member !== client) roomState(room, member);
          break;
        }
        case 'stop-publication': {
          if (room.protocol < 3 || !canModerate) {
            error(
              client,
              'FORBIDDEN',
              'Somente o dono ou moderador pode interromper outra transmissão.',
            );
            return;
          }
          if (!members(room).some((member) => member.id === message.peerId)) {
            error(
              client,
              'PEER_NOT_FOUND',
              'Participante não encontrado nesta sala.',
            );
            return;
          }
          removePublication(room, message.peerId);
          roomState(room);
          break;
        }
        case 'stream-signal': {
          const publication = [...room.publications.values()].find(
            (entry) => entry.publicationId === message.publicationId,
          );
          const peer = members(room).find(
            (member) => member.id === message.peerId,
          );
          const publishing = publication?.publisherId === client.id;
          if (
            room.protocol < 3 ||
            !publication ||
            !peer ||
            peer === client ||
            (publishing
              ? peer.watching !== publication.publicationId
              : client.watching !== publication.publicationId ||
                peer.id !== publication.publisherId) ||
            (message.signal.type === 'offer' && !publishing) ||
            (message.signal.type === 'answer' && publishing)
          ) {
            error(
              client,
              'FORBIDDEN_SIGNAL',
              'Negociação não autorizada para esta transmissão.',
            );
            return;
          }
          const key = `${publication.publicationId}:${peer.id}:${message.signal.type === 'ice' ? 'ice' : 'sdp'}`;
          const counter = client.signals.get(key) ?? freshCounter();
          client.signals.set(key, counter);
          if (
            !consume(counter, {
              max: message.signal.type === 'ice' ? 128 : 8,
              windowMs: 10000,
            })
          ) {
            error(client, 'RATE_LIMITED', 'Limite de negociação atingido.');
            return;
          }
          send(peer, {
            type: 'stream-signal',
            publicationId: publication.publicationId,
            peerId: client.id,
            signal: message.signal,
          });
          break;
        }
        case 'set-publisher':
        case 'set-moderator': {
          if (
            room.protocol === 1 ||
            (message.type === 'set-publisher' && room.protocol !== 2) ||
            (message.type === 'set-moderator' ? !isOwner : !canModerate)
          ) {
            error(
              client,
              'FORBIDDEN',
              'Você não tem permissão para alterar este papel.',
            );
            return;
          }
          const target = members(room).find(
            (member) => member.id === message.peerId,
          );
          if (!target || target.socket.readyState !== WebSocket.OPEN) {
            error(
              client,
              'PEER_NOT_FOUND',
              'Participante indisponível nesta sala.',
            );
            return;
          }
          if (message.type === 'set-moderator') {
            if (target === room.owner) {
              error(client, 'FORBIDDEN', 'O dono mantém suas permissões.');
              return;
            }
            if (message.enabled) room.moderators.add(target.id);
            else room.moderators.delete(target.id);
          } else if (target !== room.host) {
            const previous = room.host;
            room.viewers.delete(target.id);
            room.viewers.set(previous.id, previous);
            room.host = target;
            room.sharing = false;
            for (const member of members(room)) member.signals.clear();
          }
          roomState(room);
          break;
        }
        case 'leave-room':
          leave(client);
          break;
        case 'close-room':
          if (!isOwner) {
            error(client, 'FORBIDDEN', 'Somente o dono pode encerrar a sala.');
            return;
          }
          closeRoom(room, 'host-closed');
          break;
        case 'host-state':
          if (room.protocol >= 3) {
            error(
              client,
              'PROTOCOL_MISMATCH',
              'Use o controle de publicação desta versão.',
            );
            return;
          }
          if (!isHost) {
            error(
              client,
              'FORBIDDEN',
              'Somente o transmissor autorizado pode controlar a publicação.',
            );
            return;
          }
          room.sharing = message.sharing;
          if (room.protocol === 2) {
            roomState(room);
            break;
          }
          for (const viewer of room.viewers.values())
            send(viewer, { type: 'host-state', sharing: message.sharing });
          break;
        case 'kick': {
          if (!canModerate) {
            error(
              client,
              'FORBIDDEN',
              'Somente o dono ou um moderador pode remover participantes.',
            );
            return;
          }
          const viewer =
            room.protocol !== 1
              ? members(room).find((member) => member.id === message.peerId)
              : room.viewers.get(message.peerId);
          if (
            room.protocol !== 1 &&
            viewer &&
            (viewer === room.owner ||
              viewer === client ||
              (!isOwner && room.moderators.has(viewer.id)))
          ) {
            error(
              client,
              'FORBIDDEN',
              'Você não pode remover este participante.',
            );
            return;
          }
          if (!viewer) {
            error(
              client,
              'PEER_NOT_FOUND',
              'Espectador não encontrado nesta sala.',
            );
            return;
          }
          send(viewer, { type: 'kicked' });
          leave(viewer);
          break;
        }
        case 'signal': {
          if (room.protocol >= 3) {
            error(
              client,
              'PROTOCOL_MISMATCH',
              'A negociação exige identificar a transmissão.',
            );
            return;
          }
          if (room.protocol === 2 && !room.sharing) {
            error(client, 'NOT_SHARING', 'Não há publicação ativa nesta sala.');
            return;
          }
          const peer = isHost
            ? room.viewers.get(message.peerId)
            : message.peerId === room.host.id
              ? room.host
              : undefined;
          if (!peer) {
            error(
              client,
              'PEER_NOT_FOUND',
              'Participante não encontrado nesta sala.',
            );
            return;
          }
          const key = `${peer.id}:${message.signal.type === 'ice' ? 'ice' : 'sdp'}`;
          const counter = client.signals.get(key) ?? freshCounter();
          client.signals.set(key, counter);
          if (
            !consume(counter, {
              max: message.signal.type === 'ice' ? 128 : 8,
              windowMs: 10_000,
            })
          ) {
            error(client, 'RATE_LIMITED', 'Limite de negociação atingido.');
            return;
          }
          if (
            (message.signal.type === 'offer' && !isHost) ||
            (message.signal.type === 'answer' && isHost)
          ) {
            error(
              client,
              'FORBIDDEN',
              'Este tipo de sinal não é permitido para seu papel na sala.',
            );
            return;
          }
          send(peer, {
            type: 'signal',
            peerId: client.id,
            signal: message.signal,
          });
          break;
        }
      }
    });
  });
  const cleanup = setInterval(() => {
    expireRooms();
    for (const [ip, counter] of statsRequests)
      if (now() - counter.start >= 60_000) statsRequests.delete(ip);
    for (const client of clients.values())
      for (const [key, counter] of client.signals)
        if (now() - counter.start >= 10_000) client.signals.delete(key);
    const activeIps = new Set([...clients.values()].map((client) => client.ip));
    for (const [ip, state] of ips)
      if (!activeIps.has(ip) && now() - state.lastSeen >= ipRetentionMs)
        ips.delete(ip);
  }, cleanupMs);
  const heartbeat = setInterval(() => {
    for (const client of clients.values()) {
      if (!client.alive) {
        log({
          event: 'connection.heartbeat-timeout',
          details: { roomId: client.room?.logId, reason: 'timeout' },
        });
        client.socket.terminate();
        continue;
      }
      client.alive = false;
      if (client.socket.readyState === WebSocket.OPEN) client.socket.ping();
    }
  }, heartbeatMs);
  cleanup.unref();
  heartbeat.unref();
  return {
    server,
    wss,
    close() {
      closePromise ??= (async () => {
        closing = true;
        clearInterval(cleanup);
        clearInterval(heartbeat);
        for (const client of clients.values()) client.socket.terminate();
        await Promise.all([
          new Promise<void>((resolve, reject) =>
            wss.close((issue) => (issue ? reject(issue) : resolve())),
          ),
          new Promise<void>((resolve, reject) =>
            server.close((issue) =>
              issue &&
              (issue as NodeJS.ErrnoException).code !== 'ERR_SERVER_NOT_RUNNING'
                ? reject(issue)
                : resolve(),
            ),
          ),
        ]);
      })();
      return closePromise;
    },
  };
}
