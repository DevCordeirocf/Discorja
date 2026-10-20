import type {
  DiscorjaAPI,
  MultiRoomState,
  RoomState,
} from '../../../shared/protocol';
import type { PeerMetrics, StreamPreferences } from '../../../shared/quality';
import { handleCaptureAction } from '../../features/capture';
import { exportDiagnostics, exportLogs } from '../../features/diagnostics';
import {
  handlePublicationAction,
  handleRoomControlAction,
  copyRoomCode,
  rejoinRoom,
  toggleIncomingAudio,
  toggleOutgoingAudio,
} from '../../features/session';
import {
  checkForUpdates,
  downloadUpdate,
  installUpdate,
} from '../../features/updates';
import { handleNavigationAction } from './navigation-actions';
import { enterRoomFullscreen } from '../media/media-playback';
import type { AppPage } from '../../views/design';
import type { AppModal } from '../../views/modals';
import { ROOM_CODE_ALPHABET } from '../../../shared/validation';
import { getLastRoomCode } from '../../features/session/last-room-code';

export interface ActionRouterState {
  api: DiscorjaAPI | undefined;
  room: { role: 'host' | 'viewer'; code: string } | null;
  roomState: RoomState | null;
  multi: MultiRoomState | null;
  busy: 'room' | 'sources' | 'capture' | 'settings' | null;
  sharing: boolean;
  localStream: MediaStream | null;
  filteredAudioAvailable: boolean;
  watching: Parameters<typeof handlePublicationAction>[0]['watching'];
  sourcePage: 'screen' | 'window';
  selectedSource: string;
  sources: Parameters<typeof handleCaptureAction>[0]['sources'];
  activePage: AppPage;
  previousPage: AppPage;
  configUrl: string;
  receiveMuted: boolean;
  receiveVolume: number;
  preferences: StreamPreferences;
  latestMetrics: PeerMetrics[];
  incomingMetrics: PeerMetrics[];
  signalRecovering: boolean;
}

export function bindActionRouter(
  root: HTMLElement,
  getState: () => ActionRouterState,
  actions: {
    send: Parameters<typeof handleRoomControlAction>[0]['send'];
    selectPublication: Parameters<
      typeof handlePublicationAction
    >[0]['selectPublication'];
    stopPublication(peerId: string): void;
    setSourcePage(page: 'screen' | 'window'): void;
    setSelectedSource(id: string): void;
    openSources(): void;
    cancelSources(): void;
    startSharing(): void;
    stopSharing(): void;
    notify(message: string, kind?: 'error' | 'info' | 'success'): void;
    setActivePage(page: AppPage): void;
    setPreviousPage(page: AppPage): void;
    setModal(value: AppModal): void;
    clearSwitchTarget(): void;
    setReturnFocusAction(value: string): void;
    setEditingName(value: boolean): void;
    setNotice(
      value: { text: string; kind: 'error' | 'info' | 'success' } | null,
    ): void;
    setSettingUrl(value: string): void;
    clearConnectionCheck(): void;
    dismissUpdate(): void;
    confirmSwitch(): void;
    toggleSidebar(): void;
    testConnection(): void;
    leaveRoom(): void;
    connectRoom(kind: 'create' | 'join', code?: string): void;
    setJoinCode(code: string): void;
    confirmCreate(): void;
    render(): void;
    setReceiveMuted(value: boolean): void;
    setReceiveVolume(value: number): void;
  },
): void {
  root.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      'button[data-action]',
    );
    if (!button || button.disabled) return;
    const state = getState();
    if (
      handlePublicationAction({
        action: button.dataset.action,
        publicationId: button.dataset.publication,
        peerId: button.dataset.peer,
        watching: state.watching,
        selectPublication: actions.selectPublication,
        stopPublication: actions.stopPublication,
      })
    )
      return;
    if (
      handleRoomControlAction({
        action: button.dataset.action,
        peerId: button.dataset.peer,
        enabled: button.dataset.enabled,
        roomActive: !!state.room,
        send: actions.send,
      })
    )
      return;
    if (
      handleCaptureAction({
        action: button.dataset.action,
        sourceKind: button.dataset.sourceKind,
        sourceId: button.dataset.source,
        sourcePage: state.sourcePage,
        selectedSource: state.selectedSource,
        sources: state.sources,
        setSourcePage: actions.setSourcePage,
        setSelectedSource: actions.setSelectedSource,
        openSources: actions.openSources,
        cancelSources: actions.cancelSources,
        startSharing: actions.startSharing,
        stopSharing: actions.stopSharing,
        notifyStopped: () =>
          actions.notify('O compartilhamento parou. Sua sala continua aberta.'),
        render: actions.render,
      })
    )
      return;
    if (
      handleNavigationAction({
        action: button.dataset.action,
        busy: !!state.busy,
        hasRoom: !!state.room,
        activePage: state.activePage,
        previousPage: state.previousPage,
        configUrl: state.configUrl,
        setActivePage: actions.setActivePage,
        setPreviousPage: actions.setPreviousPage,
        setModal: actions.setModal,
        clearSwitchTarget: actions.clearSwitchTarget,
        setReturnFocusAction: actions.setReturnFocusAction,
        setEditingName: actions.setEditingName,
        setNotice: actions.setNotice,
        setSettingUrl: actions.setSettingUrl,
        clearConnectionCheck: actions.clearConnectionCheck,
        dismissUpdate: actions.dismissUpdate,
        confirmSwitch: actions.confirmSwitch,
        focusDisplayName: () =>
          root.querySelector<HTMLInputElement>('#display-name')?.focus(),
        render: actions.render,
        focusSettings: () =>
          root
            .querySelector<HTMLButtonElement>('[data-action=settings]')
            ?.focus(),
      })
    )
      return;
    switch (button.dataset.action) {
      case 'toggle-send-audio':
        toggleOutgoingAudio({
          role: state.room?.role,
          sharing: state.sharing,
          stream: state.localStream,
          render: actions.render,
        });
        break;
      case 'toggle-receive-audio':
        toggleIncomingAudio({
          multiRoom: !!state.multi,
          watching: !!state.watching,
          role: state.room?.role,
          localStream: state.localStream,
          filteredAudioAvailable: state.filteredAudioAvailable,
          muted: state.receiveMuted,
          volume: state.receiveVolume,
          setMuted: actions.setReceiveMuted,
          setVolume: actions.setReceiveVolume,
          render: actions.render,
          video: root.querySelector<HTMLVideoElement>('#stream-video'),
          notifyError: (message) => actions.notify(message, 'error'),
        });
        break;
      case 'export-diagnostics': {
        const now = Date.now();
        void exportDiagnostics(
          state.api,
          {
            preferences: state.preferences,
            metrics: [...state.latestMetrics, ...state.incomingMetrics]
              .filter((metric) => now - metric.timestamp <= 8000)
              .map((metric) => ({
                ...metric,
                ageMs: Math.max(0, now - metric.timestamp),
              })),
            session: {
              signaling: state.signalRecovering
                ? 'recovering'
                : state.room
                  ? 'connected'
                  : state.busy === 'room'
                    ? 'connecting'
                    : 'idle',
              publishing: state.sharing,
              watching: Boolean(state.watching),
              publications:
                state.multi?.publications.length ?? (state.sharing ? 1 : 0),
              participants:
                state.roomState && state.roomState.protocol >= 3
                  ? state.roomState.participants.length
                  : state.roomState?.protocol === 2
                    ? state.roomState.participants.length
                    : 0,
            },
          },
          actions.notify,
        );
        break;
      }
      case 'export-logs':
        void exportLogs(state.api, actions.notify);
        break;
      case 'download-update':
        void downloadUpdate(state.api, actions.notify);
        break;
      case 'confirm-install-update':
        void installUpdate(state.api, actions.leaveRoom, actions.notify);
        break;
      case 'create':
        if (state.room) actions.confirmCreate();
        else {
          actions.setModal('create');
          actions.render();
        }
        break;
      case 'generate-room-code': {
        const field = root.querySelector<HTMLInputElement>('#create-room-code');
        if (field) {
          const limit =
            Math.floor(256 / ROOM_CODE_ALPHABET.length) *
            ROOM_CODE_ALPHABET.length;
          let code = '';
          while (code.length < 8) {
            const bytes = crypto.getRandomValues(new Uint8Array(16));
            for (const byte of bytes) {
              if (byte < limit)
                code += ROOM_CODE_ALPHABET[byte % ROOM_CODE_ALPHABET.length];
              if (code.length === 8) break;
            }
          }
          field.value = code;
          field.focus();
          field.select();
        }
        break;
      }
      case 'use-last-room-code': {
        const code = getLastRoomCode();
        if (code) {
          actions.setJoinCode(code);
          actions.render();
          root.querySelector<HTMLInputElement>('#room-code')?.focus();
        } else {
          actions.notify('Ainda não há um código de sala salvo.', 'info');
        }
        break;
      }
      case 'use-last-room-code': {
        const field = root.querySelector<HTMLInputElement>('#create-room-code');
        let code = '';
        try {
          code = localStorage.getItem('discorja:last-created-room-code') ?? '';
        } catch {
          // Treat unavailable storage as if no previous code was saved.
        }
        if (field && code) {
          field.value = code;
          field.focus();
          field.select();
        } else {
          actions.notify('Ainda não há um código de sala salvo.', 'info');
        }
        break;
      }
      case 'toggle-sidebar':
        actions.toggleSidebar();
        break;
      case 'test-connection':
        actions.testConnection();
        break;
      case 'leave':
        actions.leaveRoom();
        break;
      case 'copy':
        void copyRoomCode(state.api, state.room?.code, actions.notify);
        break;
      case 'fullscreen':
        void enterRoomFullscreen(root, () =>
          actions.notify('Não foi possível abrir a tela cheia.', 'error'),
        );
        break;
      case 'rejoin':
        rejoinRoom({
          role: state.room?.role,
          code: state.room?.code,
          leaveRoom: actions.leaveRoom,
          setJoinCode: actions.setJoinCode,
          connect: actions.connectRoom,
        });
        break;
      case 'check-update':
        void checkForUpdates(state.api, actions.notify);
        break;
    }
  });
}
