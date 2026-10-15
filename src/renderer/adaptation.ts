import {
  normalizePreferences,
  QUALITY_PRESETS,
  type PeerMetrics,
  type StreamPreferences,
} from '../shared/quality';

export interface EncodingTarget {
  width: number;
  height: number;
  fps: number;
  bitrate: number;
  degradationPreference: RTCDegradationPreference;
  label: string;
}

/** A per-viewer controller. Quiet/static desktop frames are deliberately not congestion signals. */
export class AdaptiveQuality {
  private preferences: StreamPreferences;
  private level = 0;
  private bad = 0;
  private good = 0;
  private changedAt = -Infinity;
  private startedAt: number | undefined;

  constructor(preferences: StreamPreferences) {
    this.preferences = normalizePreferences(preferences);
  }

  configure(preferences: StreamPreferences): void {
    const next = normalizePreferences(preferences);
    if (
      next.preset !== this.preferences.preset ||
      next.content !== this.preferences.content ||
      next.adaptive !== this.preferences.adaptive
    ) {
      this.level = 0;
      this.bad = this.good = 0;
      this.changedAt = -Infinity;
      this.startedAt = undefined;
    }
    this.preferences = next;
  }

  observe(metrics: Partial<PeerMetrics>, now: number): boolean {
    if (!this.preferences.adaptive) return false;
    this.startedAt ??= now;
    // Let the native bandwidth estimator settle before adding our own reductions.
    if (now - this.startedAt < 10_000) return false;
    const loss = metrics.packetLossPercent;
    const bad =
      metrics.limitation === 'cpu' ||
      metrics.limitation === 'bandwidth' ||
      (loss !== undefined &&
        (loss >= 8 || (loss >= 3 && (metrics.rttMs ?? 0) >= 350)));
    const hasMedia =
      metrics.fps !== undefined || metrics.bitrateMbps !== undefined;
    const good =
      hasMedia &&
      (metrics.limitation === 'none' || (loss !== undefined && loss < 2)) &&
      metrics.limitation !== 'cpu' &&
      metrics.limitation !== 'bandwidth' &&
      (loss === undefined || loss < 2);
    this.bad = bad ? this.bad + 1 : 0;
    this.good = !bad && good ? this.good + 1 : 0;
    if (now - this.changedAt < 10_000) return false;
    if (this.bad >= 3 && this.level < 3) {
      this.level += 1;
    } else if (this.good >= 15 && this.level > 0) {
      this.level -= 1;
    } else return false;
    this.bad = this.good = 0;
    this.changedAt = now;
    return true;
  }

  target(fairBitrate: number): EncodingTarget {
    const profile = QUALITY_PRESETS[this.preferences.preset];
    const motion = this.preferences.content === 'motion';
    const level = this.preferences.adaptive ? this.level : 0;
    const spatial = (motion ? [1, 0.75, 0.5, 0.375] : [1, 1, 0.75, 0.5])[level];
    const temporal = (motion ? [1, 1, 0.75, 0.5] : [1, 2 / 3, 0.5, 1 / 3])[
      level
    ];
    const width = Math.floor((profile.width * spatial) / 2) * 2;
    const height = Math.floor((profile.height * spatial) / 2) * 2;
    const fps = Math.max(5, Math.round(profile.fps * temporal));
    const bitrate = Math.max(
      1,
      Math.floor(
        Math.min(fairBitrate, profile.bitrate * [1, 0.65, 0.4, 0.25][level]),
      ),
    );
    return {
      width,
      height,
      fps,
      bitrate,
      degradationPreference: motion
        ? 'maintain-framerate'
        : 'maintain-resolution',
      label: `Até ${width}×${height} · ${fps} FPS`,
    };
  }
}

/** One scale factor preserves source aspect ratio and never requests an upscale. */
export function resolutionScale(
  settings: MediaTrackSettings,
  target: Pick<EncodingTarget, 'width' | 'height'>,
): number | undefined {
  if (
    !settings.width ||
    !settings.height ||
    !Number.isFinite(settings.width) ||
    !Number.isFinite(settings.height)
  )
    return;
  return Math.max(
    1,
    settings.width / target.width,
    settings.height / target.height,
  );
}
