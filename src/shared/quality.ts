export type QualityPresetId = '720p30' | '1080p30' | '1080p60' | '1080p120';
export type FrameRate = 30 | 45 | 60 | 70 | 90 | 120;
export type ContentMode = 'motion' | 'detail';

export interface StreamPreferences {
  preferredCodec?: 'H264' | 'VP8' | 'VP9' | 'AV1';
  preset: QualityPresetId;
  fps?: FrameRate;
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
  '1080p120': {
    label: '1080p · 120 FPS',
    width: 1920,
    height: 1080,
    fps: 120,
    bitrate: 30_000_000,
  },
} as const;

export const FRAME_RATE_OPTIONS: readonly FrameRate[] = [
  30, 45, 60, 70, 90, 120,
];

export const DEFAULT_STREAM_PREFERENCES: StreamPreferences = {
  preset: '720p30',
  content: 'detail',
  adaptive: true,
  maxUploadMbps: 100,
};

export function normalizePreferences(input: unknown): StreamPreferences {
  const value =
    input && typeof input === 'object'
      ? (input as Partial<StreamPreferences>)
      : {};
  return {
    ...(typeof value.fps === 'number' &&
    FRAME_RATE_OPTIONS.includes(value.fps as FrameRate)
      ? { fps: value.fps as FrameRate }
      : {}),
    ...(typeof value.videoBitrateMbps === 'number' &&
    Number.isFinite(value.videoBitrateMbps) &&
    value.videoBitrateMbps > 0
      ? { videoBitrateMbps: Math.max(1, Math.min(100, value.videoBitrateMbps)) }
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
        ? Math.max(4, Math.min(500, value.maxUploadMbps))
        : 100,
  };
}

export function captureConstraints(
  preset: QualityPresetId,
  fps: number = QUALITY_PRESETS[preset].fps,
): MediaTrackConstraints {
  const profile = QUALITY_PRESETS[preset];
  return {
    width: { ideal: profile.width, max: profile.width },
    height: { ideal: profile.height, max: profile.height },
    frameRate: { ideal: fps, max: fps },
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
