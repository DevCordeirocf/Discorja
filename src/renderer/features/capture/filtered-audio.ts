import type { FilteredAudioPipeline } from '../../media/audio-capture';
import { stopTracks } from './media-tracks';

export type FilteredAudioStartResult = 'attached' | 'unavailable' | 'stale';

export async function attachFilteredAudio(options: {
  pipeline: FilteredAudioPipeline;
  stream: MediaStream;
  isCurrent: () => boolean;
  setActivePipeline: (pipeline: FilteredAudioPipeline) => void;
  isActivePipeline: () => boolean;
  registerRuntimeError: (handler: (message: string) => void) => () => void;
  setRemoveRuntimeErrorListener: (remove: () => void) => void;
  onRuntimeError: (message: string) => void;
  stopActivePipeline: () => void;
  notifyStartFailure: (message: string) => void;
}): Promise<FilteredAudioStartResult> {
  const {
    pipeline,
    stream,
    isCurrent,
    setActivePipeline,
    isActivePipeline,
    registerRuntimeError,
    setRemoveRuntimeErrorListener,
    onRuntimeError,
    stopActivePipeline,
    notifyStartFailure,
  } = options;
  let runtimeError = false;
  setActivePipeline(pipeline);
  setRemoveRuntimeErrorListener(
    registerRuntimeError((message) => {
      if (!isActivePipeline()) return;
      runtimeError = true;
      onRuntimeError(message);
    }),
  );
  try {
    await pipeline.start();
    if (!isCurrent()) {
      if (isActivePipeline()) stopActivePipeline();
      else await pipeline.dispose();
      stopTracks(stream);
      return 'stale';
    }
    if (runtimeError || pipeline.track.readyState !== 'live') {
      if (isActivePipeline()) stopActivePipeline();
      else await pipeline.dispose();
      return 'unavailable';
    }
    stream.addTrack(pipeline.track);
    return 'attached';
  } catch (error) {
    if (isActivePipeline()) stopActivePipeline();
    else await pipeline.dispose();
    notifyStartFailure(
      error instanceof Error
        ? error.message
        : 'Não foi possível excluir o Discord do áudio.',
    );
    return 'unavailable';
  }
}
