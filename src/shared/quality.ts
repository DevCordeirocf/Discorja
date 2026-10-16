export type QualityPresetId = '720p30' | '1080p30' | '1080p60';
export type ContentMode = 'motion' | 'detail';

export interface StreamPreferences {
  preferredCodec?: 'H264' | 'VP8' | 'VP9' | 'AV1';
  preset: QualityPresetId;
  content: ContentMode;
  adaptive: boolean;
  /** Total media budget shared by viewers, including audio and transport headroom. */
  maxUploadMbps: number;
  /** Optional video ceiling per viewer; absent uses the selected preset. */
  videoBitrateMbps?: number;
}

export const QUALITY_PRESETS = {
  '720p30': {
    label: '720p · 30 FPS',
    width: 1280,
    height: 720,
    fps: 30,
    bitrate: 4_000_000,
  },
  '1080p30': {
    label: '1080p · 30 FPS',
    width: 1920,
    height: 1080,
    fps: 30,
    bitrate: 8_000_000,
  },
  '1080p60': {
    label: '1080p · 60 FPS',
    width: 1920,
    height: 1080,
    fps: 60,
    bitrate: 12_000_000,
  },
} as const;

export const DEFAULT_STREAM_PREFERENCES: StreamPreferences = {
  preset: '720p30',
  content: 'detail',
  adaptive: true,
  maxUploadMbps: 40,
};

export function normalizePreferences(input: unknown): StreamPreferences {
  const value =
    input && typeof input === 'object'
      ? (input as Partial<StreamPreferences>)
      : {};
  return {
    ...(typeof value.videoBitrateMbps === 'number' &&
    Number.isFinite(value.videoBitrateMbps) &&
    value.videoBitrateMbps > 0
      ? { videoBitrateMbps: Math.max(1, Math.min(30, value.videoBitrateMbps)) }
      : {}),
    ...(value.preferredCodec &&
    ['H264', 'VP8', 'VP9', 'AV1'].includes(value.preferredCodec)
      ? { preferredCodec: value.preferredCodec }
      : {}),
    preset:
      value.preset && Object.hasOwn(QUALITY_PRESETS, value.preset)
        ? value.preset
        : DEFAULT_STREAM_PREFERENCES.preset,
    content: value.content === 'motion' ? 'motion' : 'detail',
    adaptive: typeof value.adaptive === 'boolean' ? value.adaptive : true,
    maxUploadMbps:
      typeof value.maxUploadMbps === 'number' &&
      Number.isFinite(value.maxUploadMbps)
        ? Math.max(4, Math.min(100, value.maxUploadMbps))
        : 40,
  };
}

export function captureConstraints(
  preset: QualityPresetId,
): MediaTrackConstraints {
  const profile = QUALITY_PRESETS[preset];
  return {
    width: { ideal: profile.width, max: profile.width },
    height: { ideal: profile.height, max: profile.height },
    frameRate: { ideal: profile.fps, max: profile.fps },
  };
}

export type PeerConnectionStatus = 'connected' | 'reconnecting' | 'failed';

export interface PeerMetrics {
  peerId: string;
  direction: 'outbound' | 'inbound';
  timestamp: number;
  width?: number;
  height?: number;
  fps?: number;
  bitrateMbps?: number;
  rttMs?: number;
  packetLossPercent?: number;
  codec?: string;
  encoderImplementation?: string;
  decoderImplementation?: string;
  powerEfficientEncoder?: boolean;
  powerEfficientDecoder?: boolean;
  jitterMs?: number;
  framesDropped?: number;
  freezeCount?: number;
  totalFreezesDuration?: number;
  availableOutgoingMbps?: number;
  audioCodec?: string;
  audioBitrateKbps?: number;
  audioJitterMs?: number;
  audioPacketLossPercent?: number;
  audioConcealedSamples?: number;
  audioBufferMs?: number;
  route?: 'direct' | 'relay' | 'unknown';
  limitation?: 'none' | 'cpu' | 'bandwidth' | 'other';
  levelLabel?: string;
  adaptive: boolean;
  recovering: boolean;
  parameterError?: boolean;
}
