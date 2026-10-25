import type { DiscorjaAPI, ServerMessage } from '../../../../shared/protocol';
import type { LogEventName } from '../../../../shared/logs';
import { SignalConnection } from '../../../transport/signal';
import { connectRoomSignal } from './room-connection';
import { recoverSignal } from '../lifecycle/signal-recovery';
import { compactProfileAvatar } from '../../profile/profile-avatar';
import { DISPLAY_NAME_MAX, roomCode } from '../../../../shared/validation';

interface ConnectionState {
  api: DiscorjaAPI | undefined;
  loaded: boolean;
  busy: boolean;
  hasRoom: boolean;
  displayName: string;
  profilePhoto: string;
  joinCode: string;
  signalingUrl: string;
  sessionEpoch: number;
  resumeToken: string;
  signalRecovering: boolean;
  /** Protocol of the current room; resume must reuse it. */
  roomProtocol: number | undefined;
}

interface ConnectionEffects {
  getState(): ConnectionState;
  setSocket(connection: SignalConnection): void;
  setPending(
    kind: 'create' | 'join',
    timer: ReturnType<typeof setTimeout>,
  ): void;
  setBusy(value: 'room' | null): void;
  setActivePage(value: 'home' | 'room'): void;
  setNotice(value: null): void;
  saveDisplayName(value: string): void;
  beginSession(): number;
  isCurrentSession(epoch: number): boolean;
  onMessage(message: ServerMessage): void;
  recordLog(event: LogEventName, details?: Record<string, unknown>): void;
  render(): void;
  notify(message: string, kind?: 'error' | 'info' | 'success'): void;
  leaveRoom(message: string, kind: 'error', tellServer: false): void;
  disconnectCurrentSocket(): void;
  stopPeers(): void;
  clearWatchMedia(): void;
  stopRemoteMedia(): void;
  clearMetrics(): void;
  setConnectionReconnecting(value: boolean): void;
  setRecovering(value: boolean): void;
  setResumeTimer(timer: ReturnType<typeof setTimeout>): void;
  setResumeDeadline(timer: ReturnType<typeof setTimeout>): void;
  focusDisplayName(): void;
  focusJoinCode(): void;
  focusCreateCode(): void;
}

export function createConnectionController(effects: ConnectionEffects) {
  function recoverSignaling(): void {
    const state = effects.getState();
    recoverSignal({
      hasRoom: () => effects.getState().hasRoom,
      getResumeToken: () => effects.getState().resumeToken,
      isRecovering: () => effects.getState().signalRecovering,
      setRecovering: effects.setRecovering,
      getSessionEpoch: () => effects.getState().sessionEpoch,
      isCurrentSession: effects.isCurrentSession,
      signalingUrl: state.signalingUrl,
      getProtocol: () => effects.getState().roomProtocol,
      keepMedia: () => (effects.getState().roomProtocol ?? 0) >= 3,
      setSocket: effects.setSocket,
      onMessage: effects.onMessage,
      onSocketClosed: recoverSignaling,
      sendResume: (connection, token) => {
        connection.send({ type: 'resume-room', token });
      },
      disconnectCurrentSocket: effects.disconnectCurrentSocket,
      stopPeers: effects.stopPeers,
      clearWatchMedia: effects.clearWatchMedia,
      stopRemoteMedia: effects.stopRemoteMedia,
      clearMetrics: effects.clearMetrics,
      setConnectionReconnecting: effects.setConnectionReconnecting,
      leaveRoom: effects.leaveRoom,
      notify: effects.notify,
      log: effects.recordLog,
      setResumeTimer: effects.setResumeTimer,
      setResumeDeadline: effects.setResumeDeadline,
    });
  }

  async function connectRoom(
    kind: 'create' | 'join',
    requestedCode = '',
    groupKey?: string,
  ): Promise<void> {
    const state = effects.getState();
    if (!state.api || !state.loaded || state.busy || state.hasRoom) return;
    const name = state.displayName.trim();
    if (!name || name.length > DISPLAY_NAME_MAX) {
      effects.notify(`Digite seu nome com até ${DISPLAY_NAME_MAX} caracteres.`);
      effects.focusDisplayName();
      return;
    }
    if (kind === 'join' && !roomCode(state.joinCode)) {
      effects.notify('Digite os 8 caracteres do código da sala.', 'error');
      effects.focusJoinCode();
      return;
    }
    const createCode = requestedCode;
    if (kind === 'create' && createCode && !roomCode(createCode)) {
      effects.notify(
        'O código precisa ter exatamente 8 caracteres e não pode ser composto apenas por espaços.',
        'error',
      );
      effects.focusCreateCode();
      return;
    }
    effects.saveDisplayName(name);
    effects.setNotice(null);
    effects.setActivePage('room');
    effects.setBusy('room');
    const epoch = effects.beginSession();
    effects.recordLog('signal.connecting');
    await connectRoomSignal({
      kind,
      name,
      prepareAvatar: (protocol) =>
        compactProfileAvatar(state.profilePhoto, protocol),
      code: kind === 'create' ? createCode : state.joinCode,
      groupKey: kind === 'create' ? groupKey : undefined,
      signalingUrl: state.signalingUrl,
      epoch,
      isCurrent: effects.isCurrentSession,
      onMessage: effects.onMessage,
      onDisconnected: recoverSignaling,
      setSocket: effects.setSocket,
      setPending: effects.setPending,
      onTimeout: () =>
        effects.leaveRoom(
          'O servidor não confirmou a sala a tempo. Tente novamente.',
          'error',
          false,
        ),
      onWaking: () =>
        effects.notify(
          'Acordando o servidor… isso pode levar até 1 minuto.',
          'info',
        ),
      onConnected: () => effects.setNotice(null),
      render: effects.render,
      log: effects.recordLog,
      onFailure: (message) => effects.leaveRoom(message, 'error', false),
    });
  }

  return { connectRoom };
}
