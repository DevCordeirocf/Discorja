import {
  randomInt,
  randomUUID,
  randomBytes,
  createHash,
  timingSafeEqual,
} from 'node:crypto';
import { createServer, type Server } from 'node:http';
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
import type {
  ClientMessage,
  ServerMessage,
  LegacyRoomState,
} from '../shared/protocol.js';

const DEFAULT_ORIGINS = [
  'app://discorja',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
];
const MAX_PAYLOAD = 64 * 1024;
export interface RateLimit {
  max: number;
  windowMs: number;
}

/** Limits count attempts, including failed requests. IPs use the TCP address, never forwarded headers. */
export interface SignalingOptions {
  onLog?: (entry: LogEvent) => void;
  statsToken?: string;
  resumeGraceMs?: number;
  /** Exact WebSocket Origin allowlist; defaults to the desktop app and local Vite development. */
  allowedOrigins?: readonly string[];
  maxViewers?: number;
  maxPublishers?: number;
  roomTtlMs?: number;
  maxRooms?: number;
  maxClients?: number;
  maxTrackedIps?: number;
  heartbeatIntervalMs?: number;
  cleanupIntervalMs?: number;
  rateLimits?: Partial<
    Record<
      | 'socketMessages'
      | 'ipMessages'
      | 'socketJoins'
      | 'ipJoins'
      | 'ipConnections',
      RateLimit
    >
  >;
  /** Injectable clock for deterministic expiry tests. */
  now?: () => number;
}

interface Counter {
  start: number;
  count: number;
}
interface IpState {
  lastSeen: number;
  connections: Counter;
  messages: Counter;
  joins: Counter;
}
interface Client {
  protocol: 1 | 2 | 3;
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
  resumeToken: string;
  disconnectedAt?: number;
  invalidMessages: number;
  signals: Map<string, Counter>;
}
interface Room {
  logId: string;
  createdAt: number;
  protocol: 1 | 2 | 3;
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

const positiveInteger = (
  value: number | undefined,
  fallback: number,
  name: string,
): number => {
  const resolved = value ?? fallback;
  if (!Number.isSafeInteger(resolved) || resolved < 1)
    throw new Error(`${name} precisa ser um inteiro positivo.`);
  return resolved;
};

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
  const origins = new Set(options.allowedOrigins ?? DEFAULT_ORIGINS);
  const maxViewers = positiveInteger(options.maxViewers, 9, 'maxViewers');
  const maxPublishers = positiveInteger(
    options.maxPublishers,
    2,
    'maxPublishers',
  );
  if (maxPublishers > 4 || maxPublishers > maxViewers + 1)
    throw new Error(
      'maxPublishers deve ser no máximo 4 e não exceder os participantes.',
    );
  if (maxViewers > 9) throw new Error('maxViewers deve ser no máximo 9.');
  const grace = options.resumeGraceMs ?? 20_000;
  if (!Number.isSafeInteger(grace) || grace < 0 || grace > 60_000)
    throw new Error('resumeGraceMs inválido.');
  const statsToken = options.statsToken;
  if (
    statsToken &&
    (statsToken.length < 32 || statsToken.length > 256 || /\s/.test(statsToken))
  )
    throw new Error(
      'STATS_TOKEN precisa ter entre 32 e 256 caracteres sem espaços.',
    );
  const statsHash = statsToken
    ? createHash('sha256').update(statsToken).digest()
    : undefined;
  const ttl = positiveInteger(
    options.roomTtlMs,
    4 * 60 * 60 * 1000,
    'roomTtlMs',
  );
  const maxRooms = positiveInteger(options.maxRooms, 5, 'maxRooms');
  const maxClients = positiveInteger(options.maxClients, 20, 'maxClients');
  const maxTrackedIps = positiveInteger(
    options.maxTrackedIps,
    10_000,
    'maxTrackedIps',
  );
  const heartbeatMs = positiveInteger(
    options.heartbeatIntervalMs,
    30_000,
    'heartbeatIntervalMs',
  );
  const cleanupMs = positiveInteger(
    options.cleanupIntervalMs,
    10_000,
    'cleanupIntervalMs',
  );
  const defaults = {
    socketMessages: { max: 200, windowMs: 10_000 },
    ipMessages: { max: 1000, windowMs: 10_000 },
    socketJoins: { max: 12, windowMs: 60_000 },
    ipJoins: { max: 40, windowMs: 60_000 },
    ipConnections: { max: 60, windowMs: 60_000 },
  };
  const limits = { ...defaults, ...options.rateLimits };
  for (const [name, limit] of Object.entries(limits)) {
    positiveInteger(limit.max, 1, `${name}.max`);
    positiveInteger(limit.windowMs, 1, `${name}.windowMs`);
  }
  const ipRetentionMs =
    Math.max(...Object.values(limits).map((limit) => limit.windowMs)) * 2;
  const ips = new Map<string, IpState>();
  const clients = new Map<WebSocket, Client>();
  const rooms = new Map<string, Room>();
  const sessions = new Map<string, Client>();
  const statsRequests = new Map<string, Counter>();
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
  const roomState = (
    room: Room,
    target?: Client,
    reason: 'created' | 'joined' | 'resumed' | 'updated' = 'updated',
  ) => {
    if (room.protocol === 1) return;
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
          protocol: 3,
          maxPublishers,
          watching: member.watching,
          watchRequestId: member.watchRequestId,
          subscribers: ownPublication
            ? members(room)
                .filter(
                  (other) =>
                    other.watching === ownPublication.publicationId &&
                    other.socket.readyState === WebSocket.OPEN,
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
              (other) =>
                other.watching === publication.publicationId &&
                other.socket.readyState === WebSocket.OPEN,
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
    if (room.protocol === 3) {
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
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if (request.url === '/api/stats' && statsHash) {
      const ip = request.socket.remoteAddress ?? 'unknown';
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
      response.end(
        JSON.stringify({
          schemaVersion: 1,
          scope: 'instance',
          websocketConnections: connected.length,
          participantSessions: connected.filter((c) => c.room).length,
          roomMemberships: connected.filter((c) => c.room).length,
          activeRooms: rooms.size,
          reportedScreenPublishers: connected.filter((c) =>
            c.room?.protocol === 3
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
      socket.end(
        `HTTP/1.1 ${status}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`,
      );
    };
    const ip = request.socket.remoteAddress ?? 'unknown';
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
        resumeToken: randomBytes(32).toString('hex'),
        invalidMessages: 0,
        signals: new Map(),
        messages: freshCounter(),
        joins: freshCounter(),
      };
      clients.set(websocket, client);
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
        error(client, 'INVALID_MESSAGE', 'Mensagem inválida.');
        if (++client.invalidMessages >= 3) {
          leave(client);
          socket.close(1008, 'Protocolo inválido');
        }
        return;
      }
      if (message.type === 'hello') {
        if (client.room || (message.protocol !== 2 && message.protocol !== 3)) {
          error(
            client,
            'PROTOCOL_MISMATCH',
            'Protocolo incompatível. Atualize aplicativo e servidor para versões compatíveis.',
          );
          return;
        }
        client.protocol = message.protocol;
        send(client, { type: 'hello', protocol: message.protocol });
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
          let code: string;
          do {
            code = Array.from(
              { length: 8 },
              () => ROOM_CODE_ALPHABET[randomInt(ROOM_CODE_ALPHABET.length)],
            ).join('');
          } while (rooms.has(code));
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
          };
          rooms.set(code, room);
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
        if (room.protocol !== client.protocol) {
          error(
            client,
            'PROTOCOL_MISMATCH',
            'Esta sala usa outra versão. Todos devem usar clientes compatíveis; crie uma nova sala após atualizar.',
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
        case 'publish-state': {
          if (room.protocol !== 3) {
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
          if (room.protocol !== 3) {
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
          if (
            message.publicationId !== null &&
            client.watching === message.publicationId
          ) {
            client.watching = null;
            for (const member of members(room))
              if (member !== client) roomState(room, member);
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
          if (room.protocol !== 3 || !canModerate) {
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
            room.protocol !== 3 ||
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
          if (room.protocol === 3) {
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
          if (room.protocol === 3) {
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
