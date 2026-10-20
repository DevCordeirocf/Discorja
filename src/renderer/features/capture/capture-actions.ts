import type { CaptureSource } from '../../../shared/protocol';

export function handleCaptureAction(options: {
  action?: string;
  sourceKind?: string;
  sourceId?: string;
  sourcePage: 'screen' | 'window';
  selectedSource: string;
  sources: CaptureSource[];
  setSourcePage: (page: 'screen' | 'window') => void;
  setSelectedSource: (id: string) => void;
  openSources: () => void;
  cancelSources: () => void;
  startSharing: () => void;
  stopSharing: () => void;
  notifyStopped: () => void;
  render: () => void;
}): boolean {
  switch (options.action) {
    case 'choose-source':
    case 'refresh-sources':
      options.openSources();
      return true;
    case 'cancel-sources':
      options.cancelSources();
      return true;
    case 'source-tab': {
      const nextPage = options.sourceKind === 'window' ? 'window' : 'screen';
      if (options.sourcePage !== nextPage) {
        options.setSourcePage(nextPage);
        const selectedKind = options.sources.find(
          (source) => source.id === options.selectedSource,
        )?.kind;
        if (options.selectedSource && selectedKind !== nextPage)
          options.setSelectedSource('');
        options.render();
      }
      return true;
    }
    case 'select-source':
      options.setSelectedSource(options.sourceId ?? '');
      options.render();
      return true;
    case 'start-share':
      options.startSharing();
      return true;
    case 'stop':
      options.stopSharing();
      options.notifyStopped();
      return true;
    default:
      return false;
  }
}
