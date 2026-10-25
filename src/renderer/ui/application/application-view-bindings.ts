import type {
  AppConfig,
  CaptureSource,
  MultiRoomState,
  RoomState,
  UpdateState,
} from '../../../shared/protocol';
import {
  QUALITY_PRESETS,
  type PeerMetrics,
  type StreamPreferences,
} from '../../../shared/quality';
import type { AppModal } from '../../views/modals';
import type { ChangelogEntry } from '../../features/whats-new/changelog';
import type { AppPage } from '../../views/design';
import type { SettingsSection } from '../../views/settings-view';
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
  resolveAvatar: AppViewState['resolveAvatar'];
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
  profilePhoto: string;
  profileDraft: { name: string; photo: string };
  modal: AppModal;
  sources: CaptureSource[];
  selectedSource: string;
  sourcePage: 'screen' | 'window';
  page: AppPage;
  previousPage: AppPage;
  settingsSection: SettingsSection;
  settingsDirty: boolean;
  notice: ApplicationRenderState['notice'];
  updateDismissed: boolean;
  updatePrompted: boolean;
  whatsNewPending: boolean;
  whatsNew: ChangelogEntry[];
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
    resolveAvatar: state.resolveAvatar,
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
    settingsSection: state.settingsSection,
    settingsBackTo:
      state.previousPage === 'room' && state.room ? 'room' : 'home',
    settingsDirty: state.settingsDirty,
    saving: state.busy === 'settings',
    testing: state.testingConnection,
    connectionStatus: state.room
      ? state.signalRecovering
        ? 'Reconectando'
        : 'Conectado à sala'
      : state.connectionCheck || 'Não testado',
    enabled: state.apiAvailable && state.loaded,
    connecting: state.busy === 'room',
    displayName: state.displayName,
    profilePhoto: state.profilePhoto,
    profileDraft: state.profileDraft,
    modal: state.modal,
    whatsNew: state.whatsNew,
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
    whatsNewPending: state.whatsNewPending,
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
    qualityFps:
      state.preferences.fps ?? QUALITY_PRESETS[state.preferences.preset].fps,
  };
}

export function createApplicationViewBindings(options: {
  root: HTMLDivElement;
  announcements: HTMLElement;
  getState(): ApplicationViewReadContext;
  renderReceiveAudioControls(): string;
  renderAudioToggleButton(): string;
  setModal(value: 'update' | 'whats-new'): void;
  setUpdatePrompted(value: boolean): void;
  setWhatsNewShown(): void;
  setDeferredRender(value: boolean): void;
  renderDiagnosticsTrigger(): string;
  renderHome(): string;
  renderSidebar(): string;
  renderFeatureModal(modal: AppModal): string;
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
    renderFeatureModal: options.renderFeatureModal,
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
        setWhatsNewShown: options.setWhatsNewShown,
        setDeferredRender: options.setDeferredRender,
        renderHome: options.renderHome,
        renderSettings: views.renderSettingsPage,
        renderRoom: views.renderRoom,
        renderSidebar: options.renderSidebar,
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
