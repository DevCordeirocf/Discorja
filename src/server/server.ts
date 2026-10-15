import { randomInt, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  ClientMessage,
  IceCandidate,
  ServerMessage,
  SignalPayload,
} from '../shared/protocol.js';

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
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
  /** Exact WebSocket Origin allowlist; defaults to the desktop app and local Vite development. */
  allowedOrigins?: readonly string[];
  maxViewers?: number;
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
  id: string;
  socket: WebSocket;
  ip: string;
  ipState: IpState;
  alive: boolean;
  room?: Room;
  messages: Counter;
  joins: Counter;
}
interface Room {
  code: string;
  host: Client;
  hostName: string;
  viewers: Map<string, Client>;
  expiresAt: number;
  sharing: boolean;
}

const plainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const exactKeys = (
  value: Record<string, unknown>,
  required: string[],
  optional: string[] = [],
) =>
  required.every((key) => Object.hasOwn(value, key)) &&
  Object.keys(value).every(
    (key) => required.includes(key) || optional.includes(key),
  );
const boundedString = (value: unknown, max: number, min = 1): value is string =>
  typeof value === 'string' && value.length >= min && value.length <= max;
const validName = (value: unknown): value is string =>
  boundedString(value, 40) &&
  value.trim().length > 0 &&
  !/[\u0000-\u001f\u007f]/u.test(value);
const validPeerId = (value: unknown): value is string =>
  boundedString(value, 64) && /^[a-zA-Z0-9-]+$/u.test(value);

function validCandidate(value: unknown): value is IceCandidate {
  if (
    !plainObject(value) ||
    !exactKeys(
      value,
      ['candidate'],
      ['sdpMid', 'sdpMLineIndex', 'usernameFragment'],
    )
  )
    return false;
  if (!boundedString(value.candidate, 4096, 0)) return false;
  if (
    Object.hasOwn(value, 'sdpMid') &&
    value.sdpMid !== null &&
    !boundedString(value.sdpMid, 128, 0)
  )
    return false;
  if (
    Object.hasOwn(value, 'usernameFragment') &&
    value.usernameFragment !== null &&
    !boundedString(value.usernameFragment, 256, 0)
  )
    return false;
  return (
    !Object.hasOwn(value, 'sdpMLineIndex') ||
    value.sdpMLineIndex === null ||
    (Number.isInteger(value.sdpMLineIndex) &&
      Number(value.sdpMLineIndex) >= 0 &&
      Number(value.sdpMLineIndex) <= 65535)
  );
}

function validSignal(value: unknown): value is SignalPayload {
  if (!plainObject(value)) return false;
  if (value.type === 'offer' || value.type === 'answer')
    return (
      exactKeys(value, ['type', 'sdp']) && boundedString(value.sdp, 56_000)
    );
  return (
    value.type === 'ice' &&
    exactKeys(value, ['type', 'candidate']) &&
    validCandidate(value.candidate)
  );
}

function parseMessage(value: unknown): ClientMessage | undefined {
  if (!plainObject(value)) return;
  switch (value.type) {
    case 'create-room':
      if (exactKeys(value, ['type', 'name']) && validName(value.name))
        return { type: value.type, name: value.name.trim() };
      break;
    case 'join-room': {
      if (
        !exactKeys(value, ['type', 'code', 'name']) ||
        !validName(value.name) ||
        !boundedString(value.code, 40)
      )
        return;
      const code = value.code.replace(/[- ]/gu, '').toUpperCase();
      if (
        code.length === 8 &&
        [...code].every((character) => CODE_ALPHABET.includes(character))
      )
        return { type: value.type, name: value.name.trim(), code };
      break;
    }
    case 'signal':
      if (
        exactKeys(value, ['type', 'peerId', 'signal']) &&
        validPeerId(value.peerId) &&
        validSignal(value.signal)
      )
        return value as ClientMessage;
      break;
    case 'kick':
      if (exactKeys(value, ['type', 'peerId']) && validPeerId(value.peerId))
        return { type: value.type, peerId: value.peerId };
      break;
    case 'host-state':
      if (
        exactKeys(value, ['type', 'sharing']) &&
        typeof value.sharing === 'boolean'
      )
        return { type: value.type, sharing: value.sharing };
      break;
    case 'close-room':
    case 'leave-room':
      if (exactKeys(value, ['type'])) return { type: value.type };
      break;
  }
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
  const origins = new Set(options.allowedOrigins ?? DEFAULT_ORIGINS);
  const maxViewers = positiveInteger(options.maxViewers, 4, 'maxViewers');
  const ttl = positiveInteger(
    options.roomTtlMs,
    4 * 60 * 60 * 1000,
    'roomTtlMs',
  );
  const maxRooms = positiveInteger(options.maxRooms, 1000, 'maxRooms');
  const maxClients = positiveInteger(options.maxClients, 5000, 'maxClients');
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
  const error = (client: Client, code: string, message: string) =>
    send(client, { type: 'error', code, message });
  const closeRoom = (
    room: Room,
    reason: 'host-left' | 'host-closed' | 'expired',
  ) => {
    if (!rooms.delete(room.code)) return;
    for (const member of [room.host, ...room.viewers.values()]) {
      member.room = undefined;
      send(member, { type: 'room-closed', reason });
    }
    room.viewers.clear();
  };
  const leave = (client: Client) => {
    const room = client.room;
    if (!room) return;
    if (room.host === client) {
      closeRoom(room, 'host-left');
      return;
    }
    client.room = undefined;
    if (room.viewers.delete(client.id))
      send(room.host, { type: 'viewer-left', peerId: client.id });
  };
  const expireRooms = () => {
    for (const room of rooms.values())
      if (now() >= room.expiresAt) closeRoom(room, 'expired');
  };
  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
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
        id: randomUUID(),
        socket: websocket,
        ip,
        ipState: acceptedIpState,
        alive: true,
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
    socket.on('error', () => {
      /* close performs membership cleanup after a failed transport. */
    });
    socket.on('close', () => {
      leave(client);
      clients.delete(socket);
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
        socket.close(1008, 'Limite de mensagens');
        return;
      }
      expireRooms();
      let message: ClientMessage | undefined;
      try {
        if (!isBinary) message = parseMessage(JSON.parse(data.toString()));
      } catch {
        /* Invalid JSON is rejected below. */
      }
      if (!message) {
        error(client, 'INVALID_MESSAGE', 'Mensagem inválida.');
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
              () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)],
            ).join('');
          } while (rooms.has(code));
          const room: Room = {
            code,
            host: client,
            hostName: message.name,
            viewers: new Map(),
            expiresAt: now() + ttl,
            sharing: false,
          };
          rooms.set(code, room);
          client.room = room;
          send(client, {
            type: 'room-created',
            code,
            selfId: client.id,
            maxViewers,
          });
          return;
        }
        const room = rooms.get(message.code);
        if (!room) {
          error(client, 'ROOM_NOT_FOUND', 'Sala não encontrada ou expirada.');
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
        send(client, {
          type: 'room-joined',
          code: room.code,
          selfId: client.id,
          hostId: room.host.id,
          hostName: room.hostName,
          sharing: room.sharing,
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
      switch (message.type) {
        case 'leave-room':
          leave(client);
          break;
        case 'close-room':
          if (!isHost) {
            error(
              client,
              'FORBIDDEN',
              'Apenas o anfitrião pode encerrar a sala.',
            );
            return;
          }
          closeRoom(room, 'host-closed');
          break;
        case 'host-state':
          if (!isHost) {
            error(
              client,
              'FORBIDDEN',
              'Apenas o anfitrião pode controlar a transmissão.',
            );
            return;
          }
          room.sharing = message.sharing;
          for (const viewer of room.viewers.values())
            send(viewer, { type: 'host-state', sharing: message.sharing });
          break;
        case 'kick': {
          if (!isHost) {
            error(
              client,
              'FORBIDDEN',
              'Apenas o anfitrião pode remover espectadores.',
            );
            return;
          }
          const viewer = room.viewers.get(message.peerId);
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
    const activeIps = new Set([...clients.values()].map((client) => client.ip));
    for (const [ip, state] of ips)
      if (!activeIps.has(ip) && now() - state.lastSeen >= ipRetentionMs)
        ips.delete(ip);
  }, cleanupMs);
  const heartbeat = setInterval(() => {
    for (const client of clients.values()) {
      if (!client.alive) {
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
