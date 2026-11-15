import type {
  AppConfig,
  CaptureSource,
  MultiRoomState,
  RoomParticipant,
  RoomState,
  UpdateState,
} from '../../../shared/protocol';
import {
  QUALITY_PRESETS,
  type PeerMetrics,
  type StreamPreferences,
} from '../../../shared/quality';
import { createElement, type ReactNode } from 'react';
import { DiagnosticsPanel } from '../../views/diagnostics';
import type {
  ReceiveAudioControlState,
  SendAudioControlState,
} from '../../views/audio-controls';
import {
  ModalView,
  type AppModal,
  type CaptureAudioView,
} from '../../views/modals';
import { QualityPanel } from '../../views/quality';
import { ProfileSettings } from '../../views/profile-settings';
import type { ProfileCameraState } from '../../features/profile/profile-camera';
import { SettingsView, type SettingsSection } from '../../views/settings-view';
import { SingleRoom } from '../../views/single-room';
import { Stage } from '../../views/stage';
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
  profileCamera: ProfileCameraState;
  modal: AppModal;
  whatsNew: ChangelogEntry[];
  isRoomOwner: boolean;
  sources: CaptureSource[];
  selectedSource: string;
  sourcePage: 'screen' | 'window';
  captureAudio: CaptureAudioView;
  hasRoom: boolean;
  sendAudio: Omit<SendAudioControlState, 'className'>;
  receiveAudio: ReceiveAudioControlState;
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
  renderFeatureModal?(modal: AppModal): ReactNode;
}): {
  patchMetrics(): void;
  renderSettingsPage(): ReactNode;
  renderRoom(): ReactNode;
  renderModal(): ReactNode;
} {
  const state = deps.getState;
  const diagnostics = (s: AppViewState): ReactNode => {
    if (!s.room) return null;
    return createElement(DiagnosticsPanel, {
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
      return createElement(SettingsView, {
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
        photoProcessing: s.profileCamera.processing,
        qualityPanel:
          s.settingsSection === 'transmissao'
            ? createElement(QualityPanel, {
                preferences: s.preferences,
                pendingPreferences: s.pendingPreferences,
                disabled: s.disabled,
                applying: s.applyingPreferences,
                sharing: s.sharing,
                status: s.qualityStatus,
              })
            : null,
        profilePanel:
          s.settingsSection === 'perfil'
            ? createElement(ProfileSettings, {
                draft: s.profileDraft,
                camera: s.profileCamera,
              })
            : null,
      });
    },
    renderRoom: () => {
      const s = state();
      if (!s.room) return null;
      const busy = s.busy || s.applyingPreferences || s.signalRecovering;
      const reconnectingVideo =
        s.connectionReconnecting &&
        s.room.role === 'viewer' &&
        !!s.remoteStream;
      if (s.multi)
        return createElement(Stage, {
          state: s.multi,
          avatarUrl: s.resolveAvatar,
          watching: s.watchingPublisherId ?? null,
          sharing: s.sharing,
          stream: s.watchingPublisherId ? s.remoteStream : s.localStream,
          hasRemote: !!s.remoteStream,
          hasLocal: !!s.localStream,
          busy,
          issue: s.connectionIssue,
          recovering: s.connectionReconnecting || s.signalRecovering,
          reconnectingVideo,
          sendAudio: s.sendAudio,
          receiveAudio: s.receiveAudio,
        });
      const preset = QUALITY_PRESETS[s.preferences.preset];
      return createElement(SingleRoom, {
        room: s.room,
        roomState: s.roomState?.protocol === 2 ? s.roomState : null,
        stream: s.room.role === 'host' ? s.localStream : s.remoteStream,
        sharedSourceName: s.sharedSourceName,
        idleSourceLabel:
          s.room.role === 'host'
            ? `Perfil ${preset.width} × ${preset.height} · ${s.preferences.fps ?? preset.fps} QPS · sem áudio`
            : 'Vídeo compartilhado · sem áudio',
        sharing: s.sharing,
        remoteSharing: s.remoteSharing,
        connectionIssue: s.connectionIssue,
        reconnectingVideo,
        busy,
        displayName: s.displayName,
        viewers: s.participantViews,
        sendAudio: s.sendAudio,
        receiveAudio: s.receiveAudio,
      });
    },
    renderModal: () => {
      const s = state();
      return createElement(ModalView, {
        modal: s.modal,
        isRoomOwner: s.isRoomOwner,
        update: s.update,
        version: s.config.version,
        hasRoom: s.hasRoom,
        diagnostics: diagnostics(s),
        whatsNew: s.whatsNew,
        renderFeatureModal: deps.renderFeatureModal,
        sources: s.sources,
        selectedSource: s.selectedSource,
        busy: s.busyKind,
        sourcePage: s.sourcePage,
        captureAudio: s.captureAudio,
      });
    },
  };
}
