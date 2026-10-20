import {
  captureConstraints,
  type StreamPreferences,
} from '../../../shared/quality';
import type { RoomPeers } from '../../media/rtc';

export interface QualityApplicationResult {
  applied: boolean;
  rolledBack: boolean;
}

export async function applyQualityToMedia(options: {
  candidate: StreamPreferences;
  previous: StreamPreferences;
  track: MediaStreamTrack | undefined;
  peers: RoomPeers | null;
  isCurrent: () => boolean;
}): Promise<QualityApplicationResult | null> {
  const { candidate, previous, track, peers, isCurrent } = options;
  try {
    if (track) {
      if (candidate.preset !== previous.preset)
        await track.applyConstraints(captureConstraints(candidate.preset));
      if (!isCurrent()) return null;
      track.contentHint = candidate.content;
    }
    await peers?.configure(candidate);
    if (!isCurrent()) return null;
    return { applied: true, rolledBack: true };
  } catch {
    if (!isCurrent()) return null;
    let rolledBack = true;
    try {
      if (track) {
        await track.applyConstraints(captureConstraints(previous.preset));
        if (!isCurrent()) return null;
        track.contentHint = previous.content;
      }
      await peers?.configure(previous);
    } catch {
      rolledBack = false;
    }
    if (!isCurrent()) return null;
    return { applied: false, rolledBack };
  }
}
