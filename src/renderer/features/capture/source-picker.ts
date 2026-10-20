import type { CaptureSource, DiscorjaAPI } from '../../../shared/protocol';

interface SourcePickerOptions {
  api: DiscorjaAPI | undefined;
  role: 'host' | 'viewer' | undefined;
  sharing: boolean;
  busy: 'room' | 'sources' | 'capture' | 'settings' | null;
  applyingPreferences: boolean;
  getSessionEpoch: () => number;
  beginAttempt: () => number;
  isCurrent: (session: number, attempt: number) => boolean;
  getModal: () => string | null;
  setBusy: (value: 'sources' | null) => void;
  setReturnFocusAction: (value: string) => void;
  setSources: (sources: CaptureSource[]) => void;
  setSourcePage: (page: 'screen' | 'window') => void;
  clearSelection: () => void;
  resetAudioOptions: () => void;
  setModal: (value: string | null) => void;
  clearNotice: () => void;
  render: () => void;
  notify: (message: string, kind: 'error') => void;
  cancelCapture: () => void;
}

export async function openSourcePicker(
  options: SourcePickerOptions,
): Promise<void> {
  const {
    api,
    role,
    sharing,
    busy,
    applyingPreferences,
    getSessionEpoch,
    beginAttempt,
    isCurrent,
    getModal,
    setBusy,
    setReturnFocusAction,
    setSources,
    setSourcePage,
    clearSelection,
    resetAudioOptions,
    setModal,
    clearNotice,
    render,
    notify,
  } = options;
  if (!api || role !== 'host' || sharing || busy || applyingPreferences) return;
  const epoch = getSessionEpoch();
  const attempt = beginAttempt();
  setBusy('sources');
  setReturnFocusAction('choose-source');
  setSources([]);
  setSourcePage('screen');
  clearSelection();
  resetAudioOptions();
  setModal('sources');
  clearNotice();
  render();
  try {
    const available = await api.getSources();
    if (!isCurrent(epoch, attempt) || getModal() !== 'sources') return;
    setSources(available);
    setSourcePage(
      available.some((source) => source.kind === 'screen')
        ? 'screen'
        : 'window',
    );
    setBusy(null);
    render();
  } catch {
    if (!isCurrent(epoch, attempt)) return;
    setModal(null);
    setBusy(null);
    notify(
      'Não foi possível listar as telas e janelas. Tente novamente.',
      'error',
    );
  }
}

export function cancelSourcePicker(options: {
  api: DiscorjaAPI | undefined;
  busy: 'room' | 'sources' | 'capture' | 'settings' | null;
  invalidateAttempt: () => void;
  setModal: (value: null) => void;
  setBusy: (value: null) => void;
  render: () => void;
}): void {
  options.invalidateAttempt();
  options.setModal(null);
  if (options.busy === 'capture' || options.busy === 'sources')
    options.setBusy(null);
  void options.api?.cancelCapture().catch(() => undefined);
  options.render();
}
