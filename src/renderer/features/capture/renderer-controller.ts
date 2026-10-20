import type {
  AppConfig,
  CaptureSource,
  DiscorjaAPI,
} from '../../../shared/protocol';
import type { StreamPreferences, PeerMetrics } from '../../../shared/quality';
import type { AppModal } from '../../views/modals';
import type { FilteredAudioPipeline } from '../../media/audio-capture';
import type { RoomPeers } from '../../media/rtc';
import { stopTracks } from './media-tracks';
import { stopSharingSession } from './stop-sharing';
import { cancelSourcePicker, openSourcePicker } from './source-picker';
import { startSharing as startShareSession } from './start-sharing';

type Busy = 'room' | 'sources' | 'capture' | 'settings' | null;

export interface CaptureControllerState {
  api: DiscorjaAPI | undefined;
  role: 'host' | 'viewer' | undefined;
  sharing: boolean;
  busy: Busy;
  applyingPreferences: boolean;
  pendingPreferences: StreamPreferences | null;
  qualityStatus: string;
  sessionEpoch: number;
  captureEpoch: number;
  qualityEpoch: number;
  modal: AppModal;
  returnFocusAction: string;
  sources: CaptureSource[];
  sourcePage: 'screen' | 'window';
  selectedSource: string;
  preferences: StreamPreferences;
  captureSystemAudio: boolean;
  excludeAppAudio: boolean;
  config: AppConfig;
  multiRoom: boolean;
  publicationCount: number;
  maxPublishers: number;
  localStream: MediaStream | null;
  filteredAudioPipeline: FilteredAudioPipeline | null;
  peers: RoomPeers | null;
  viewers: Map<
    string,
    { connected: boolean; failed: boolean; reconnecting: boolean }
  >;
  receiveMuted: boolean;
  metricsStartedAt: number;
  latestMetrics: PeerMetrics[];
  sharedSourceName: string;
  connectionIssue: string;
  localPublicationId: string;
  publicationConfirmed: boolean;
  removeRuntimeErrorListener: (() => void) | null;
}

export interface CaptureControllerEffects {
  render(): void;
  notify(message: string, kind?: 'error' | 'info' | 'success'): void;
  send(message: import('../../../shared/protocol').ClientMessage): boolean;
  updatePlayback(): void;
  stopFilteredAudioPipeline(): void;
  refreshAudioPublication(): void;
  recordCaptureFailure(error: unknown): void;
  clearNotice(): void;
}

export function createCaptureController(
  state: CaptureControllerState,
  effects: CaptureControllerEffects,
) {
  let startInProgress = false;

  function isSharing(): boolean {
    return state.sharing || !!state.localStream || !!state.localPublicationId;
  }

  function stopSharing(announce = true): void {
    stopSharingSession({
      announce,
      isHost: state.role === 'host',
      isMultiRoom: state.multiRoom,
      preferences: state.preferences,
      takePublicationId: () => {
        const publicationId = state.localPublicationId;
        state.localPublicationId = '';
        return publicationId;
      },
      resetCaptureState: () => {
        state.publicationConfirmed = false;
        state.captureEpoch++;
        state.qualityEpoch++;
        state.applyingPreferences = false;
        state.pendingPreferences = null;
        state.qualityStatus = '';
        state.latestMetrics = [];
        state.metricsStartedAt = 0;
      },
      stopAudioPipeline: effects.stopFilteredAudioPipeline,
      stopLocalTracks: () => stopTracks(state.localStream),
      clearLocalStream: () => {
        state.localStream = null;
        state.sharing = false;
        state.sharedSourceName = '';
      },
      clearPeerConnections: () => state.peers?.clear(),
      configurePeers: (preferences) => {
        void state.peers?.configure(preferences).catch(() => undefined);
      },
      resetBusyAndModal: () => {
        if (state.busy === 'capture' || state.busy === 'sources')
          state.busy = null;
        if (state.modal === 'sources') state.modal = null;
      },
      cancelCapture: () =>
        void state.api?.cancelCapture().catch(() => undefined),
      setNativeSharing: (value) =>
        void state.api?.setSharing(value).catch(() => undefined),
      send: effects.send,
    });
  }

  async function openSources(): Promise<void> {
    await openSourcePicker({
      api: state.api,
      role: state.role,
      sharing: isSharing(),
      busy: state.busy,
      applyingPreferences: state.applyingPreferences,
      getSessionEpoch: () => state.sessionEpoch,
      beginAttempt: () => ++state.captureEpoch,
      isCurrent: (session, attempt) =>
        session === state.sessionEpoch && attempt === state.captureEpoch,
      getModal: () => state.modal,
      setBusy: (value) => (state.busy = value),
      setReturnFocusAction: (value) => (state.returnFocusAction = value),
      setSources: (value) => (state.sources = value),
      setSourcePage: (value) => (state.sourcePage = value),
      clearSelection: () => (state.selectedSource = ''),
      resetAudioOptions: () => {
        state.captureSystemAudio = false;
        state.excludeAppAudio = false;
      },
      setModal: (value) => (state.modal = value as AppModal),
      clearNotice: effects.clearNotice,
      render: effects.render,
      notify: (message) => effects.notify(message, 'error'),
      cancelCapture: () =>
        void state.api?.cancelCapture().catch(() => undefined),
    });
  }

  function cancelSources(): void {
    cancelSourcePicker({
      api: state.api,
      busy: state.busy,
      invalidateAttempt: () => state.captureEpoch++,
      setModal: (value) => (state.modal = value),
      setBusy: (value) => (state.busy = value),
      render: effects.render,
    });
  }

  async function startSharing(): Promise<void> {
    if (startInProgress || isSharing()) return;
    startInProgress = true;
    try {
      await startShareSession({
        api: state.api,
        busy: !!state.busy,
        applyingPreferences: state.applyingPreferences,
        getRoomRole: () => state.role,
        sharing: isSharing(),
        selectedSource: state.selectedSource,
        sources: state.sources,
        getSessionEpoch: () => state.sessionEpoch,
        getCaptureEpoch: () => state.captureEpoch,
        preferences: state.preferences,
        captureSystemAudio: state.captureSystemAudio,
        excludeAppAudio: state.excludeAppAudio,
        systemAudioSupported: state.config.systemAudioSupported,
        multiRoom: state.multiRoom,
        publicationCount: state.publicationCount,
        maxPublishers: state.maxPublishers,
        getLocalStream: () => state.localStream,
        getFilteredAudioPipeline: () => state.filteredAudioPipeline,
        getPeers: () => state.peers,
        viewers: state.viewers,
        send: effects.send,
        setCaptureEpoch: (value) => (state.captureEpoch = value),
        setReceiveMuted: (value) => (state.receiveMuted = value),
        updatePlayback: effects.updatePlayback,
        setBusy: (value) => (state.busy = value ? 'capture' : null),
        setModal: (value) => (state.modal = value),
        setActivePipeline: (value) => (state.filteredAudioPipeline = value),
        isActivePipeline: (value) => state.filteredAudioPipeline === value,
        setRemoveRuntimeErrorListener: (value) =>
          (state.removeRuntimeErrorListener = value),
        setLocalStream: (value) => (state.localStream = value),
        setSharing: (value) => (state.sharing = value),
        setMetricsStartedAt: (value) => (state.metricsStartedAt = value),
        clearMetrics: () => (state.latestMetrics = []),
        setSharedSourceName: (value) => (state.sharedSourceName = value),
        setConnectionIssue: (value) => (state.connectionIssue = value),
        setPublicationId: (value) => (state.localPublicationId = value),
        setPublicationConfirmed: (value) =>
          (state.publicationConfirmed = value),
        render: effects.render,
        notify: effects.notify,
        logFailure: effects.recordCaptureFailure,
        stopSharing,
        stopFilteredAudioPipeline: effects.stopFilteredAudioPipeline,
        refreshAudioPublication: effects.refreshAudioPublication,
      });
    } finally {
      startInProgress = false;
    }
  }

  return { openSources, cancelSources, startSharing, stopSharing };
}
