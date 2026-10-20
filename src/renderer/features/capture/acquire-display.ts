import type { DiscorjaAPI } from '../../../shared/protocol';
import { captureDisplay } from './display-capture';
import { prepareCapturedTracks, stopTracks } from './media-tracks';

export async function acquireDisplayStream(options: {
  api: DiscorjaAPI;
  sourceId: string;
  video: MediaTrackConstraints;
  audio: MediaTrackConstraints | false;
  contentHint: string;
  isCurrent: () => boolean;
}): Promise<MediaStream | null> {
  const { api, sourceId, video, audio, contentHint, isCurrent } = options;
  await api.selectSource(sourceId, audio !== false);
  if (!isCurrent()) return null;
  const stream = await captureDisplay(video, audio);
  if (!isCurrent()) {
    stopTracks(stream);
    return null;
  }
  prepareCapturedTracks(stream, contentHint);
  return stream;
}
