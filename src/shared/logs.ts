const EVENTS = [
  'app.started',
  'app.stopping',
  'app.start-failed',
  'app.exception',
  'app.rejection',
  'renderer.gone',
  'renderer.unresponsive',
  'renderer.responsive',
  'renderer.error',
  'renderer.rejection',
  'power.suspend',
  'power.resume',
  'signal.connecting',
  'signal.connected',
  'signal.closed',
  'signal.connect-failed',
  'signal.recovery-started',
  'signal.retry',
  'signal.resumed',
  'signal.recovery-failed',
  'room.created',
  'room.joined',
  'room.closed',
  'room.left',
  'room.rejected',
  'capture.started',
  'capture.stopped',
  'capture.failed',
  'rtc.failed',
  'updater.error',
  'server.started',
  'server.stopping',
  'server.error',
  'room.ended',
  'connection.closed',
  'connection.error',
  'connection.heartbeat-timeout',
  'request.received',
  'renderer.audio-startup',
] as const;

export type LogEventName = (typeof EVENTS)[number];
export interface LogEvent {
  event: LogEventName;
  details?: Record<string, unknown>;
}

const REASONS = [
  'host-left',
  'host-closed',
  'expired',
  'user',
  'deadline',
  'rejected',
  'timeout',
  'protocol',
  'network',
  'unknown',
  'clean-exit',
  'abnormal-exit',
  'killed',
  'crashed',
  'oom',
  'launch-failed',
  'integrity-failure',
];
const ERROR_CODES = [
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'ENOTFOUND',
  'EAI_AGAIN',
  'EACCES',
  'EPERM',
  'ENOENT',
  'ENOSPC',
  'EADDRINUSE',
  'CERT_HAS_EXPIRED',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'ERR_CERT_AUTHORITY_INVALID',
  'ERR_INTERNET_DISCONNECTED',
  'ERR_CONNECTION_RESET',
  'ERR_NETWORK_CHANGED',
  'ERR_FILE_NOT_FOUND',
  'ERR_BLOCKED_BY_CLIENT',
  'INVALID_MESSAGE',
  'RATE_LIMITED',
  'ROOM_NOT_FOUND',
  'ROOM_FULL',
  'SERVER_FULL',
  'ALREADY_IN_ROOM',
  'NOT_IN_ROOM',
  'FORBIDDEN',
  'PEER_NOT_FOUND',
  'RESUME_REJECTED',
  'PROTOCOL_MISMATCH',
  'PUBLICATION_LIMIT',
  'STALE_PUBLICATION',
  'INVALID_PUBLICATION',
  'PUBLICATION_NOT_FOUND',
];

/** Only fixed events and bounded fields; never error.message, stack, URLs or payloads. */
export function sanitizeLogEvent(input: unknown): LogEvent | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const candidate = input as Record<string, unknown>;
  if (!EVENTS.includes(candidate.event as LogEventName)) return null;
  const details: Record<string, unknown> = {};
  const raw = candidate.details;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const fields = raw as Record<string, unknown>;
    for (const key of [
      'session',
      'attempt',
      'durationMs',
      'participants',
      'protocol',
      'clientProtocol',
      'code',
      'roomTtlMs',
      'resumeGraceMs',
      'exitCode',
      'line',
      'column',
    ]) {
      const value = fields[key];
      if (
        Number.isSafeInteger(value) &&
        Math.abs(Number(value)) <= Number.MAX_SAFE_INTEGER
      )
        details[key] = value;
    }
    if (
      fields.channel === 'http' ||
      fields.channel === 'websocket' ||
      fields.channel === 'websocket-message'
    )
      details.channel = fields.channel;
    if (
      [
        'initializing',
        'playing',
        'running',
        'ended',
        'suspended',
        'interrupted',
        'closed',
        'failed',
        'started',
        'unsupported',
        'missing-element',
      ].includes(String(fields.audioState))
    )
      details.audioState = fields.audioState;
    if (
      typeof fields.operation === 'string' &&
      [
        'health',
        'stats',
        'not-found',
        'handshake',
        'invalid',
        'rate-limited',
        'hello',
        'create-room',
        'join-room',
        'resume-room',
        'leave-room',
        'close-room',
        'host-state',
        'signal',
        'publish-state',
        'watch-publication',
        'stream-signal',
        'stop-publication',
        'set-publisher',
        'set-moderator',
        'kick',
      ].includes(fields.operation)
    )
      details.operation = fields.operation;
    if (
      typeof fields.method === 'string' &&
      ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'].includes(
        fields.method,
      )
    )
      details.method = fields.method;
    if (
      Number.isInteger(fields.statusCode) &&
      Number(fields.statusCode) >= 100 &&
      Number(fields.statusCode) <= 599
    )
      details.statusCode = fields.statusCode;
    if (
      Number.isInteger(fields.clientProtocol) &&
      [1, 2, 3].includes(Number(fields.clientProtocol))
    )
      details.clientProtocol = fields.clientProtocol;
    if (
      [
        'new',
        'connecting',
        'connected',
        'disconnected',
        'failed',
        'closed',
      ].includes(String(fields.connectionState))
    )
      details.connectionState = fields.connectionState;
    if (
      [
        'new',
        'checking',
        'connected',
        'completed',
        'disconnected',
        'failed',
        'closed',
      ].includes(String(fields.iceConnectionState))
    )
      details.iceConnectionState = fields.iceConnectionState;
    if (fields.role === 'host' || fields.role === 'viewer')
      details.role = fields.role;
    if (typeof fields.clean === 'boolean') details.clean = fields.clean;
    if (
      ['main', 'preload', 'renderer', 'server'].includes(
        String(fields.component),
      ) &&
      typeof fields.component === 'string'
    )
      details.component = fields.component;
    if (fields.signal === 'SIGINT' || fields.signal === 'SIGTERM')
      details.signal = fields.signal;
    if (typeof fields.reason === 'string' && REASONS.includes(fields.reason))
      details.reason = fields.reason;
    for (const key of ['errorCode', 'serverCode'])
      if (typeof fields[key] === 'string' && ERROR_CODES.includes(fields[key]))
        details[key] = fields[key];
    if (
      typeof fields.errorName === 'string' &&
      [
        'Error',
        'TypeError',
        'RangeError',
        'SyntaxError',
        'DOMException',
        'NotAllowedError',
        'NotFoundError',
        'NotReadableError',
        'AbortError',
        'InvalidStateError',
        'OperationError',
        'SecurityError',
      ].includes(fields.errorName)
    )
      details.errorName = fields.errorName;
    if (
      typeof fields.version === 'string' &&
      /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]{1,40})?$/.test(fields.version)
    )
      details.version = fields.version;
    if (
      typeof fields.roomId === 'string' &&
      /^[a-f0-9-]{36}$/.test(fields.roomId)
    )
      details.roomId = fields.roomId;
  }
  return { event: candidate.event as LogEventName, details };
}

export function errorFields(error: unknown): Record<string, unknown> {
  if (!error || typeof error !== 'object') return {};
  const value = error as { name?: unknown; code?: unknown; stack?: unknown };
  const frame =
    typeof value.stack === 'string'
      ? /[/\\](main\.cjs|preload\.cjs|index-[\w-]+\.js|server[/\\](?:index|server)\.[jt]s):(\d+):(\d+)/.exec(
          value.stack.slice(0, 65536),
        )
      : null;
  return sanitizeLogEvent({
    event: 'app.exception',
    details: {
      errorName: value.name,
      errorCode: value.code,
      ...(frame
        ? {
            component:
              frame[1] === 'main.cjs'
                ? 'main'
                : frame[1] === 'preload.cjs'
                  ? 'preload'
                  : frame[1].startsWith('server')
                    ? 'server'
                    : 'renderer',
            line: Number(frame[2]),
            column: Number(frame[3]),
          }
        : {}),
    },
  })!.details!;
}

/** The renderer cannot impersonate main-process/server lifecycle events. */
export function rendererLogEvent(input: unknown): LogEvent | null {
  const safe = sanitizeLogEvent(input);
  return safe &&
    /^(renderer\.(error|rejection|audio-startup)|signal\.|room\.(created|joined|closed|left|rejected)|capture\.(failed)|rtc\.)/.test(
      safe.event,
    )
    ? safe
    : null;
}
