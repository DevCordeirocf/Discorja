import type {
  AppConfig,
  CaptureSource,
  MultiRoomState,
  RoomState,
  UpdateState,
} from '../../../shared/protocol';
import type { PeerMetrics, StreamPreferences } from '../../../shared/quality';
import type { AppModal } from '../../views/modals';
import type { AppPage } from '../../views/design';
import type { AppViewState } from './app-views';
import { createAppViews } from './app-views';
import {
  renderApplication,
  type ApplicationRenderState,
} from './render-application';

export interface ApplicationViewReadContext {
  preferences: StreamPreferences;
  pendingPreferences: StreamPreferences | null;
  applyingPreferences: boolean;
  sharing: boolean;
  qualityStatus: string;
  room: AppViewState['room'];
  roomState: RoomState | null;
  multi: MultiRoomState | null;
  viewers: AppViewState['viewers'];
  watchingPublisherId?: string;
  watchingRemote: boolean;
  remoteStream: MediaStream | null;
  localStream: MediaStream | null;
  sharedSourceName: string;
  remoteSharing: boolean;
  busy: ApplicationRenderState['busy'];
  connectionIssue: string;
  connectionReconnecting: boolean;
  signalRecovering: boolean;
  metrics: PeerMetrics[];
  incomingMetrics: PeerMetrics[];
  metricsStartedAt: number;
  incomingMetricsStartedAt: number;
  update: UpdateState;
  config: AppConfig;
  serverUrl: string;
  apiAvailable: boolean;
  loaded: boolean;
  testingConnection: boolean;
  connectionCheck: string;
  displayName: string;
  editingName: boolean;
  joinCode: string;
  modal: AppModal;
  sources: CaptureSource[];
  selectedSource: string;
  sourcePage: 'screen' | 'window';
  page: AppPage;
  sidebarCollapsed: boolean;
  notice: ApplicationRenderState['notice'];
  updateDismissed: boolean;
  updatePrompted: boolean;
  includeSystemAudio: boolean;
  excludeDiscordAudio: boolean;
  returnFocusAction: string;
}

function toAppViewState(state: ApplicationViewReadContext): AppViewState {
  const busy = !!state.busy;
  return {
    preferences: state.preferences,
    pendingPreferences: state.pendingPreferences,
    disabled: busy,
    applyingPreferences: state.applyingPreferences,
    sharing: state.sharing,
    qualityStatus: state.qualityStatus,
    room: state.room,
    roomState: state.roomState,
    multi: state.multi,
    viewers: state.viewers,
    watchingPublisherId: state.watchingPublisherId,
    remoteStream: state.remoteStream,
    localStream: state.localStream,
    sharedSourceName: state.sharedSourceName,
    remoteSharing: state.remoteSharing,
    busy,
    busyKind: state.busy,
    connectionIssue: state.connectionIssue,
    connectionReconnecting: state.connectionReconnecting,
    signalRecovering: state.signalRecovering,
    metrics: state.metrics,
    incomingMetrics: state.incomingMetrics,
    metricsStartedAt: state.metricsStartedAt,
    incomingMetricsStartedAt: state.incomingMetricsStartedAt,
    update: state.update,
    config: state.config,
    serverUrl: state.serverUrl,
    connected: !!state.room,
    settingsDisabled:
      !state.apiAvailable ||
      !state.loaded ||
      busy ||
      state.applyingPreferences ||
      (!!state.room && state.room.role !== 'host'),
    saving: state.busy === 'settings',
    testing: state.testingConnection,
    connectionStatus: state.room
      ? state.signalRecovering
        ? 'Reconectando'
        : 'Conectado à sala'
      : state.connectionCheck || 'Não testado',
    qualityControls: '',
    enabled: state.apiAvailable && state.loaded,
    connecting: state.busy === 'room',
    displayName: state.displayName,
    editingName: state.editingName,
    joinCode: state.joinCode,
    modal: state.modal,
    isRoomOwner: state.roomState?.ownerId === state.room?.selfId,
    sources: state.sources,
    selectedSource: state.selectedSource,
    sourcePage: state.sourcePage,
    hasRoom: !!state.room,
    audioControl: '',
    playerAudioControl: '',
    participantViews: [...state.viewers].map(([id, viewer]) => ({
      id,
      ...viewer,
    })),
  };
}

function toApplicationRenderState(
  state: ApplicationViewReadContext,
): ApplicationRenderState {
  return {
    page: state.page,
    sidebarCollapsed: state.sidebarCollapsed,
    displayName: state.displayName,
    version: state.config.version,
    hasRoom: !!state.room,
    recovering: state.signalRecovering,
    hasDesktopApi: state.apiAvailable,
    notice: state.notice,
    modal: state.modal,
    busy: state.busy,
    loaded: state.loaded,
    update: state.update,
    updateDismissed: state.updateDismissed,
    updatePrompted: state.updatePrompted,
    multiRoom: !!state.multi,
    watchingRemote: state.watchingRemote,
    localStream: state.localStream,
    remoteStream: state.remoteStream,
    roomRole: state.room?.role,
    connectionReconnecting: state.connectionReconnecting,
    applyingPreferences: state.applyingPreferences,
    maxPublishersReached:
      !!state.multi &&
      state.multi.publications.length >= state.multi.maxPublishers,
    includeSystemAudio: state.includeSystemAudio,
    systemAudioSupported: state.config.systemAudioSupported,
    excludeDiscordAudio: state.excludeDiscordAudio,
    returnFocusAction: state.returnFocusAction,
    connectionIssue: state.connectionIssue,
    sharing: state.sharing,
    qualityPreset: state.preferences.preset,
  };
}

export function createApplicationViewBindings(options: {
  root: HTMLDivElement;
  announcements: HTMLElement;
  getState(): ApplicationViewReadContext;
  renderReceiveAudioControls(): string;
  renderAudioToggleButton(): string;
  setModal(value: 'update'): void;
  setUpdatePrompted(value: boolean): void;
  setDeferredRender(value: boolean): void;
  renderDiagnosticsTrigger(): string;
  updatePlayback(): void;
  syncPreviews(): void;
}): {
  patchMetrics(): void;
  render(): void;
} {
  const getState = options.getState;
  const views = createAppViews({
    root: options.root,
    getState: () => {
      const state = toAppViewState(getState());
      return {
        ...state,
        audioControl: options.renderAudioToggleButton(),
        playerAudioControl: options.renderReceiveAudioControls(),
      };
    },
    renderReceiveAudioControls: options.renderReceiveAudioControls,
    renderAudioToggleButton: options.renderAudioToggleButton,
  });

  return {
    patchMetrics: views.patchMetrics,
    render: () =>
      renderApplication({
        root: options.root,
        announcements: options.announcements,
        state: toApplicationRenderState(getState()),
        setModal: options.setModal,
        setUpdatePrompted: options.setUpdatePrompted,
        setDeferredRender: options.setDeferredRender,
        renderHome: views.renderHome,
        renderSettings: views.renderSettingsPage,
        renderRoom: views.renderRoom,
        renderModal: views.renderModal,
        renderDiagnosticsTrigger: options.renderDiagnosticsTrigger,
        renderReceiveAudioControls: options.renderReceiveAudioControls,
        renderAudioToggleButton: options.renderAudioToggleButton,
        updatePlayback: options.updatePlayback,
        syncPreviews: options.syncPreviews,
        patchMetrics: views.patchMetrics,
      }),
  };
}
