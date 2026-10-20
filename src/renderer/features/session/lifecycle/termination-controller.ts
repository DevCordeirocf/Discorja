import { endRoomSession } from './room-lifecycle';

export interface SessionTerminationState {
  room: { role: 'host' | 'viewer'; selfId: string } | null;
  ownerId: string | undefined;
}

export interface SessionTerminationActions {
  stopSharing(announce?: boolean): void;
  logLeft(reason: 'user' | 'unknown'): void;
  clearSessionTimers(): void;
  clearResumeState(): void;
  sendRoomClose(type: 'close-room' | 'leave-room'): void;
  advanceSession(): void;
  clearPending(): void;
  clearRemoteTimer(): void;
  clearWatchMedia(): void;
  resetWatchSelection(): void;
  disposePeers(): void;
  disconnectSocket(): void;
  stopRemoteMedia(): void;
  resetRoomState(notice: { text: string; kind: 'error' | 'info' } | null): void;
  render(): void;
}

export function createSessionTerminationController(
  getState: () => SessionTerminationState,
  actions: SessionTerminationActions,
) {
  function stopSharing(announce = true): void {
    actions.stopSharing(announce);
  }

  function leaveRoom(
    message?: string,
    kind: 'error' | 'info' = 'info',
    tellServer = true,
  ): void {
    const state = getState();
    endRoomSession({
      room: state.room,
      ownerId: state.ownerId,
      message,
      kind,
      tellServer,
      logLeft: actions.logLeft,
      clearSessionTimers: actions.clearSessionTimers,
      clearResumeState: actions.clearResumeState,
      sendRoomClose: actions.sendRoomClose,
      advanceSession: actions.advanceSession,
      clearPending: actions.clearPending,
      clearRemoteTimer: actions.clearRemoteTimer,
      stopSharing: () => actions.stopSharing(false),
      clearWatchMedia: actions.clearWatchMedia,
      resetWatchSelection: actions.resetWatchSelection,
      disposePeers: actions.disposePeers,
      disconnectSocket: actions.disconnectSocket,
      stopRemoteMedia: actions.stopRemoteMedia,
      resetRoomState: actions.resetRoomState,
      render: actions.render,
    });
  }

  return { stopSharing, leaveRoom };
}
