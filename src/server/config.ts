import { createHash } from 'node:crypto';
import type { LogEvent } from '../shared/logs.js';

export interface RateLimit {
  max: number;
  windowMs: number;
}

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
  rateLimits?: Partial<Record<RateLimitName, RateLimit>>;
  /** Injectable clock for deterministic expiry tests. */
  now?: () => number;
}

export type RateLimitName =
  'socketMessages' | 'ipMessages' | 'socketJoins' | 'ipJoins' | 'ipConnections';

export interface ResolvedSignalingConfig {
  origins: Set<string>;
  maxViewers: number;
  maxPublishers: number;
  grace: number;
  statsHash?: Buffer;
  ttl: number;
  maxRooms: number;
  maxClients: number;
  maxTrackedIps: number;
  heartbeatMs: number;
  cleanupMs: number;
  limits: Record<RateLimitName, RateLimit>;
  ipRetentionMs: number;
}

export const MAX_PAYLOAD = 128 * 1024;

const DEFAULT_ORIGINS = [
  'app://discorja',
  'http://127.0.0.1:5173',
  'http://localhost:5173',
];

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

/** Validate deployment settings once, before opening the HTTP/WebSocket service. */
export function resolveSignalingConfig(
  options: SignalingOptions = {},
): ResolvedSignalingConfig {
  const maxViewers = positiveInteger(options.maxViewers, 9, 'maxViewers');
  const maxPublishers = positiveInteger(
    options.maxPublishers,
    Math.min(10, maxViewers + 1),
    'maxPublishers',
  );
  if (maxPublishers > 10 || maxPublishers > maxViewers + 1)
    throw new Error(
      'maxPublishers deve ser no máximo 10 e não exceder os participantes.',
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
  const defaults: Record<RateLimitName, RateLimit> = {
    socketMessages: { max: 200, windowMs: 10_000 },
    ipMessages: { max: 1000, windowMs: 10_000 },
    socketJoins: { max: 12, windowMs: 60_000 },
    ipJoins: { max: 40, windowMs: 60_000 },
    ipConnections: { max: 60, windowMs: 60_000 },
  };
  const limits: Record<RateLimitName, RateLimit> = {
    ...defaults,
    ...options.rateLimits,
  };
  for (const [name, limit] of Object.entries(limits)) {
    positiveInteger(limit.max, 1, `${name}.max`);
    positiveInteger(limit.windowMs, 1, `${name}.windowMs`);
  }

  return {
    origins: new Set(options.allowedOrigins ?? DEFAULT_ORIGINS),
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
    ipRetentionMs:
      Math.max(...Object.values(limits).map((limit) => limit.windowMs)) * 2,
  };
}
