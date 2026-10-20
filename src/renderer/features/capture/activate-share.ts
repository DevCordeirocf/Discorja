import type { DiscorjaAPI } from '../../../shared/protocol';
import type { StreamPreferences } from '../../../shared/quality';
import { stopTracks } from './media-tracks';

export async function activateShareCapture(options: {
  api: DiscorjaAPI;
  stream: MediaStream;
  preferences: StreamPreferences;
  configurePeers: (preferences: StreamPreferences) => Promise<void>;
  isCurrent: () => boolean;
  stopAudioPipeline: () => void;
}): Promise<boolean> {
  await options.configurePeers(options.preferences);
  if (!options.isCurrent()) {
    options.stopAudioPipeline();
    stopTracks(options.stream);
    return false;
  }
  await options.api.setSharing(true);
  if (!options.isCurrent()) {
    options.stopAudioPipeline();
    stopTracks(options.stream);
    void options.api.setSharing(false).catch(() => undefined);
    return false;
  }
  return true;
}
