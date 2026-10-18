import { createSignalingServer } from './server.js';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  errorFields,
  sanitizeLogEvent,
  type LogEvent,
} from '../shared/logs.js';

const runId = randomUUID();
const version: unknown = JSON.parse(
  readFileSync(new URL('../../package.json', import.meta.url), 'utf8'),
).version;
const log = (entry: LogEvent): void => {
  const safe = sanitizeLogEvent({
    ...entry,
    details: { ...entry.details, version },
  });
  if (safe)
    console.info(
      JSON.stringify({
        schemaVersion: 1,
        timestamp: new Date().toISOString(),
        runId,
        ...safe,
      }),
    );
};
process.on('uncaughtExceptionMonitor', (error) =>
  log({ event: 'server.error', details: errorFields(error) }),
);

function integerEnv(name: string, fallback: number, min = 1): number {
  const value = process.env[name];
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!/^\d+$/u.test(value) || !Number.isSafeInteger(parsed) || parsed < min)
    throw new Error(`${name} precisa ser um inteiro maior ou igual a ${min}.`);
  return parsed;
}

const port = integerEnv('PORT', 8787, 0);
if (port > 65535) throw new Error('PORT precisa estar entre 0 e 65535.');
const host = process.env.HOST ?? '127.0.0.1';
const roomTtlMs = integerEnv('ROOM_TTL_MS', 4 * 60 * 60 * 1000);
const resumeGraceMs = integerEnv('RESUME_GRACE_MS', 20_000, 0);
const service = createSignalingServer({
  onLog: log,
  allowedOrigins: process.env.ALLOWED_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  statsToken: process.env.STATS_TOKEN || undefined,
  resumeGraceMs,
  maxViewers: integerEnv('MAX_VIEWERS', 9),
  maxPublishers: integerEnv('MAX_PUBLISHERS', 10),
  roomTtlMs,
  maxRooms: integerEnv('MAX_ROOMS', 5),
  maxClients: integerEnv('MAX_CLIENTS', 20),
});
service.server.on('error', (error: Error) => {
  log({ event: 'server.error', details: errorFields(error) });
  console.error('Não foi possível iniciar a sinalização:', error.message);
  process.exitCode = 1;
});
service.server.listen(port, host, () => {
  log({
    event: 'server.started',
    details: { roomTtlMs, resumeGraceMs, protocol: 3 },
  });
  const address = service.server.address();
  console.info(
    `Sinalização Discorja disponível em ${host}:${typeof address === 'object' && address ? address.port : port}.`,
  );
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    log({ event: 'server.stopping', details: { signal } });
    void service.close().catch((error: Error) => {
      log({ event: 'server.error', details: errorFields(error) });
      console.error(error.message);
      process.exitCode = 1;
    });
  });
}
