import type { StreamPreferences } from '../../shared/quality';

export type VideoCodecName = NonNullable<StreamPreferences['preferredCodec']>;

/**
 * Order tried by "Automático". H264 has the widest hardware encode and decode
 * support on Windows; AV1 comes last because many viewers still decode it in
 * software. VP8 is normally software-only in Chromium.
 */
export const AUTOMATIC_CODEC_ORDER: readonly VideoCodecName[] = [
  'H264',
  'VP9',
  'AV1',
];

export interface EncodingProbeTarget {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
}

/** Puts the preferred codec first and keeps every other codec as a fallback. */
export function orderCodecs<T extends { mimeType: string }>(
  codecs: readonly T[],
  preferred: VideoCodecName,
): T[] {
  const mime = `video/${preferred}`.toLowerCase();
  return [
    ...codecs.filter((codec) => codec.mimeType.toLowerCase() === mime),
    ...codecs.filter((codec) => codec.mimeType.toLowerCase() !== mime),
  ];
}

/**
 * First codec the system reports as power efficient (usually a hardware
 * encoder). Unknown or failing probes leave the browser's own order.
 */
export async function pickEfficientCodec(
  available: readonly string[],
  powerEfficient: (codec: VideoCodecName) => Promise<boolean>,
): Promise<VideoCodecName | undefined> {
  const offered = new Set(available.map((mime) => mime.toLowerCase()));
  for (const codec of AUTOMATIC_CODEC_ORDER) {
    if (!offered.has(`video/${codec}`.toLowerCase())) continue;
    try {
      if (await powerEfficient(codec)) return codec;
    } catch {
      /* An unsupported probe is the same as "not known to be efficient". */
    }
  }
  return undefined;
}

/** Media Capabilities probe with a short deadline so offers are never held up. */
export function mediaCapabilitiesProbe(
  target: EncodingProbeTarget,
  capabilities: MediaCapabilities | undefined = typeof navigator === 'undefined'
    ? undefined
    : navigator.mediaCapabilities,
  timeoutMs = 800,
): ((codec: VideoCodecName) => Promise<boolean>) | undefined {
  if (!capabilities?.encodingInfo) return undefined;
  return async (codec) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const info = await Promise.race([
        capabilities.encodingInfo({
          type: 'webrtc',
          video: {
            contentType: `video/${codec}`,
            width: target.width,
            height: target.height,
            framerate: target.fps,
            bitrate: target.bitrate,
          },
        }),
        new Promise<undefined>((resolve) => {
          timer = setTimeout(() => resolve(undefined), timeoutMs);
        }),
      ]);
      return Boolean(info?.supported && info.powerEfficient);
    } finally {
      clearTimeout(timer);
    }
  };
}
