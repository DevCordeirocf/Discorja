import type {
  AppConfig,
  CaptureSource,
  MultiRoomState,
  RoomParticipant,
  RoomState,
  UpdateState,
} from '../../../shared/protocol';
import type { PeerMetrics, StreamPreferences } from '../../../shared/quality';
import { renderDiagnostics } from '../../views/diagnostics';
import { renderModal, type AppModal } from '../../views/modals';
import { renderQualityPanel } from '../../views/quality';
import { renderProfileSettings } from '../../views/profile-settings';
import {
  renderSettingsView,
  type SettingsSection,
} from '../../views/settings-view';
import { renderSingleRoom } from '../../views/single-room';
import { renderStage } from '../../views/stage';
import { patchMetrics } from '../../features/quality';
import type { ChangelogEntry } from '../../features/whats-new/changelog';

export interface AppViewState {
  preferences: StreamPreferences;
  pendingPreferences: StreamPreferences | null;
  disabled: boolean;
  applyingPreferences: boolean;
  sharing: boolean;
  qualityStatus: string;
  room: {
    role: 'host' | 'viewer';
    hostId?: string;
    hostName: string;
    code: string;
    selfId: string;
    maxViewers: number;
  } | null;
  roomState: RoomState | null;
  multi: MultiRoomState | null;
  resolveAvatar: (person: RoomParticipant) => string | undefined;
  viewers: Map<
    string,
    { name: string; connected: boolean; failed: boolean; reconnecting: boolean }
  >;
  watchingPublisherId?: string;
  remoteStream: MediaStream | null;
  localStream: MediaStream | null;
  sharedSourceName: string;
  remoteSharing: boolean;
  busy: boolean;
  busyKind: 'room' | 'sources' | 'capture' | 'settings' | null;
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
  connected: boolean;
  settingsSection: SettingsSection;
  settingsBackTo: 'room' | 'home';
  settingsDirty: boolean;
  saving: boolean;
  testing: boolean;
  connectionStatus: string;
  enabled: boolean;
  connecting: boolean;
  displayName: string;
  profilePhoto: string;
  profileDraft: { name: string; photo: string };
  modal: AppModal;
  whatsNew: ChangelogEntry[];
  isRoomOwner: boolean;
  sources: CaptureSource[];
  selectedSource: string;
  sourcePage: 'screen' | 'window';
  hasRoom: boolean;
  playerAudioControl: string;
  audioControl: string;
  participantViews: Array<{
    id: string;
    name: string;
    connected: boolean;
    failed: boolean;
    reconnecting: boolean;
  }>;
}

export function createAppViews(deps: {
  getState(): AppViewState;
  root: HTMLElement;
  renderReceiveAudioControls(): string;
  renderAudioToggleButton(): string;
  renderFeatureModal?(modal: AppModal): string;
}): {
  renderQualityPanel(): string;
  renderDiagnostics(): string;
  patchMetrics(): void;
  renderSettingsPage(): string;
  renderRoom(): string;
  renderModal(): string;
} {
  const state = deps.getState;
  const diagnostics = (s: AppViewState): string => {
    if (!s.room) return '';
    return renderDiagnostics({
      room: {
        role: s.room.role,
        hostId: s.room.hostId,
        hostName: s.room.hostName,
      },
      multi: s.multi,
      viewers: [...s.viewers].map(([id, person]) => ({
        id,
        name: person.name,
      })),
      watchingPublisherId: s.watchingPublisherId,
    });
  };
  return {
    renderQualityPanel: () => {
      const s = state();
      return renderQualityPanel({
        preferences: s.preferences,
        pendingPreferences: s.pendingPreferences,
        disabled: s.disabled,
        applying: s.applyingPreferences,
        sharing: s.sharing,
        status: s.qualityStatus,
      });
    },
    renderDiagnostics: () => diagnostics(state()),
    patchMetrics: () => {
      const s = state();
      patchMetrics(deps.root, {
        room: s.room,
        multiRoom: !!s.multi,
        sharing: s.sharing,
        remoteSharing: s.remoteSharing,
        latestMetrics: s.metrics,
        incomingMetrics: s.incomingMetrics,
        localStream: s.localStream,
        viewers: s.viewers,
        connectionReconnecting: s.connectionReconnecting,
        connectionIssue: s.connectionIssue,
        metricsStartedAt: s.metricsStartedAt,
        incomingMetricsStartedAt: s.incomingMetricsStartedAt,
      });
    },
    renderSettingsPage: () => {
      const s = state();
      return renderSettingsView({
        section: s.settingsSection,
        config: s.config,
        update: s.update,
        serverUrl: s.serverUrl,
        connected: s.connected,
        saving: s.saving,
        testing: s.testing,
        connectionStatus: s.connectionStatus,
        backTo: s.settingsBackTo,
        dirty: s.settingsDirty,
        qualityControls:
          s.settingsSection === 'transmissao'
            ? renderQualityPanel({
                preferences: s.preferences,
                pendingPreferences: s.pendingPreferences,
                disabled: s.disabled,
                applying: s.applyingPreferences,
                sharing: s.sharing,
                status: s.qualityStatus,
              })
            : '',
        profileControls:
          s.settingsSection === 'perfil'
            ? renderProfileSettings(s.profileDraft)
            : '',
      });
    },
    renderRoom: () => {
      const s = state();
      if (!s.room) return '';
      if (s.multi)
        return renderStage({
          state: s.multi,
          avatarUrl: s.resolveAvatar,
          watching: s.watchingPublisherId ?? null,
          sharing: s.sharing,
          hasRemote: !!s.remoteStream,
          hasLocal: !!s.localStream,
          busy: s.busy || s.applyingPreferences || s.signalRecovering,
          issue: s.connectionIssue,
          recovering: s.connectionReconnecting || s.signalRecovering,
          audioControl: s.audioControl,
          playerAudioControl: s.playerAudioControl,
        });
      return renderSingleRoom({
        room: s.room,
        roomState: s.roomState?.protocol === 2 ? s.roomState : null,
        sharedSourceName: s.sharedSourceName,
        sharing: s.sharing,
        remoteSharing: s.remoteSharing,
        hasLocalVideo: !!s.localStream,
        hasRemoteVideo: !!s.remoteStream,
        connectionIssue: s.connectionIssue,
        busy: s.busy,
        displayName: s.displayName,
        viewers: s.participantViews,
      });
    },
    renderModal: () => {
      const s = state();
      return renderModal({
        modal: s.modal,
        isRoomOwner: s.isRoomOwner,
        update: s.update,
        version: s.config.version,
        hasRoom: s.hasRoom,
        renderDiagnostics: () => diagnostics(s),
        whatsNew: s.whatsNew,
        renderFeatureModal: deps.renderFeatureModal,
        sources: s.sources,
        selectedSource: s.selectedSource,
        busy: s.busyKind,
        sourcePage: s.sourcePage,
      });
    },
  };
}
