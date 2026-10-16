import { normalizePreferences } from './quality';
import { object } from './validation';
import { ROOM_PROTOCOL_VERSION } from './protocol';

export interface DiagnosticEnvironment {
  platform: string;
  architecture: string;
  electron?: string;
  chromium?: string;
  node?: string;
  updateStatus: string;
  workingSetKiB?: number;
  privateKiB?: number;
}

/** Allowlist rather than serializing RTC reports, SDP, names or connection addresses. */
export function sanitizeDiagnostics(
  input: unknown,
  version: string,
  environment?: DiagnosticEnvironment,
) {
  if (
    !object(input) ||
    !Array.isArray(input.metrics) ||
    input.metrics.length > 100
  )
    throw new Error('Diagnóstico inválido.');
  const numeric = [
    'width',
    'height',
    'fps',
    'bitrateMbps',
    'rttMs',
    'packetLossPercent',
    'jitterMs',
    'framesDropped',
    'freezeCount',
    'totalFreezesDuration',
    'availableOutgoingMbps',
    'audioBitrateKbps',
    'audioJitterMs',
    'audioPacketLossPercent',
    'audioConcealedSamples',
    'audioBufferMs',
    'ageMs',
  ] as const;
  return {
    schemaVersion: 2,
    version,
    generatedAt: new Date().toISOString(),
    preferences: normalizePreferences(input.preferences),
    session: (() => {
      const session = object(input.session) ? input.session : {};
      const safe: Record<string, unknown> = { protocol: ROOM_PROTOCOL_VERSION };
      if (
        ['idle', 'connecting', 'connected', 'recovering', 'offline'].includes(
          String(session.signaling),
        )
      )
        safe.signaling = session.signaling;
      for (const key of ['publishing', 'watching'])
        if (typeof session[key] === 'boolean') safe[key] = session[key];
      for (const [key, limit] of [
        ['publications', 4],
        ['participants', 101],
      ] as const)
        if (
          Number.isInteger(session[key]) &&
          Number(session[key]) >= 0 &&
          Number(session[key]) <= limit
        )
          safe[key] = session[key];
      return safe;
    })(),
    runtime: (() => {
      const safe: Record<string, unknown> = {};
      if (!environment) return safe;
      if (['win32', 'linux', 'darwin'].includes(environment.platform))
        safe.platform = environment.platform;
      if (['x64', 'arm64', 'ia32'].includes(environment.architecture))
        safe.architecture = environment.architecture;
      for (const key of ['electron', 'chromium', 'node'] as const) {
        const value = environment[key];
        if (typeof value === 'string' && /^\d+(\.\d+){1,3}$/.test(value))
          safe[key] = value;
      }
      if (
        [
          'disabled',
          'idle',
          'checking',
          'available',
          'downloading',
          'downloaded',
          'error',
          'current',
        ].includes(environment.updateStatus)
      )
        safe.updateStatus = environment.updateStatus;
      for (const key of ['workingSetKiB', 'privateKiB'] as const) {
        const value = environment[key];
        if (typeof value === 'number' && Number.isFinite(value) && value >= 0)
          safe[key] = value;
      }
      return safe;
    })(),
    streams: input.metrics.map((entry, index) => {
      if (!object(entry)) throw new Error('Medição inválida.');
      const safe: Record<string, unknown> = {
        stream: index + 1,
        direction: entry.direction === 'outbound' ? 'outbound' : 'inbound',
      };
      for (const key of numeric) {
        const v = entry[key];
        if (typeof v === 'number' && Number.isFinite(v) && v >= 0)
          safe[key] = v;
      }
      if (['direct', 'relay', 'unknown'].includes(String(entry.route)))
        safe.route = entry.route;
      if (
        ['none', 'cpu', 'bandwidth', 'other'].includes(String(entry.limitation))
      )
        safe.limitation = entry.limitation;
      if (
        typeof entry.codec === 'string' &&
        /^video\/(vp8|vp9|h264|av1)$/i.test(entry.codec)
      )
        safe.codec = entry.codec;
      if (
        typeof entry.audioCodec === 'string' &&
        /^audio\/(opus|pcmu|pcma)$/i.test(entry.audioCodec)
      )
        safe.audioCodec = entry.audioCodec;
      for (const key of [
        'powerEfficientEncoder',
        'powerEfficientDecoder',
        'parameterError',
        'recovering',
        'adaptive',
      ])
        if (typeof entry[key] === 'boolean') safe[key] = entry[key];
      return safe;
    }),
  };
}
