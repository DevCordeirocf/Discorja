import type { CaptureSource, DiscorjaAPI } from '../../../shared/protocol';
import {
  captureConstraints,
  type StreamPreferences,
} from '../../../shared/quality';
import { SYSTEM_AUDIO_CONSTRAINTS } from '../../../shared/audio';
import {
  createFilteredAudioPipeline,
  type FilteredAudioPipeline,
} from '../../media/audio-capture';
import { acquireDisplayStream } from './acquire-display';
import { attachFilteredAudio } from './filtered-audio';

export type PreparedCapture =
  | { status: 'stale' }
  | {
      status: 'ready';
      stream: MediaStream;
      audioPipeline: FilteredAudioPipeline | null;
    };

export async function prepareShareCapture(options: {
  api: DiscorjaAPI;
  source: CaptureSource;
  preferences: StreamPreferences;
  captureSystemAudio: boolean;
  excludeDiscorjaAudio: boolean;
  isCurrent: () => boolean;
  notify: (message: string, kind: 'error') => void;
  setActivePipeline: (pipeline: FilteredAudioPipeline) => void;
  isActivePipeline: (pipeline: FilteredAudioPipeline) => boolean;
  registerRuntimeError: (handler: (message: string) => void) => () => void;
  setRemoveRuntimeErrorListener: (remove: () => void) => void;
  onRuntimeError: (pipeline: FilteredAudioPipeline, message: string) => void;
  stopActivePipeline: () => void;
}): Promise<PreparedCapture> {
  const {
    api,
    source,
    preferences,
    captureSystemAudio,
    excludeDiscorjaAudio,
    isCurrent,
    notify,
    setActivePipeline,
    isActivePipeline,
    registerRuntimeError,
    setRemoveRuntimeErrorListener,
    onRuntimeError,
    stopActivePipeline,
  } = options;
  const useFilteredAudio = captureSystemAudio && excludeDiscorjaAudio;
  let audioPipeline: FilteredAudioPipeline | null = null;
  if (useFilteredAudio) {
    try {
      audioPipeline = await createFilteredAudioPipeline(api);
    } catch (error) {
      const reason =
        error instanceof Error
          ? error.message
          : 'Não foi possível preparar o áudio filtrado.';
      notify(
        `O áudio filtrado não pôde ser preparado; o vídeo continuará sem áudio. ${reason}`,
        'error',
      );
    }
  }
  if (!isCurrent()) {
    await audioPipeline?.dispose();
    return { status: 'stale' };
  }
  let stream: MediaStream | null;
  try {
    stream = await acquireDisplayStream({
      api,
      sourceId: source.id,
      video: captureConstraints(preferences.preset, preferences.fps),
      audio:
        captureSystemAudio && !useFilteredAudio
          ? SYSTEM_AUDIO_CONSTRAINTS
          : false,
      contentHint: preferences.content,
      isCurrent,
    });
  } catch (error) {
    await audioPipeline?.dispose();
    throw error;
  }
  if (!stream) {
    await audioPipeline?.dispose();
    return { status: 'stale' };
  }
  if (audioPipeline) {
    const pipeline = audioPipeline;
    const result = await attachFilteredAudio({
      pipeline,
      stream,
      isCurrent,
      setActivePipeline,
      isActivePipeline: () => isActivePipeline(pipeline),
      registerRuntimeError,
      setRemoveRuntimeErrorListener,
      onRuntimeError: (message) => onRuntimeError(pipeline, message),
      stopActivePipeline,
      notifyStartFailure: (message) =>
        notify(`Vídeo iniciado sem áudio: ${message}`, 'error'),
    });
    if (result === 'stale') return { status: 'stale' };
    if (result === 'unavailable') audioPipeline = null;
  }
  return { status: 'ready', stream, audioPipeline };
}
