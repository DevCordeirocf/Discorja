import type { DiscorjaAPI } from '../../../shared/protocol';
import type { FilteredAudioPipeline } from '../../media/audio-capture';

export function createFilteredAudioStopper(deps: {
  api: DiscorjaAPI | undefined;
  getPipeline(): FilteredAudioPipeline | null;
  setPipeline(value: FilteredAudioPipeline | null): void;
  getRemoveErrorListener(): (() => void) | null;
  setRemoveErrorListener(value: (() => void) | null): void;
}): () => void {
  return () => {
    deps.getRemoveErrorListener()?.();
    deps.setRemoveErrorListener(null);
    const pipeline = deps.getPipeline();
    deps.setPipeline(null);
    if (pipeline) {
      pipeline.track.onended = null;
      void pipeline.dispose();
    } else void deps.api?.stopDiscordAudioCapture().catch(() => undefined);
  };
}
