import { normalizePreferences } from './quality';
import { object } from './validation';

/** Allowlist rather than serializing RTC reports, SDP, names or connection addresses. */
export function sanitizeDiagnostics(input: unknown, version: string) {
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
  ] as const;
  return {
    schemaVersion: 1,
    version,
    generatedAt: new Date().toISOString(),
    preferences: normalizePreferences(input.preferences),
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
