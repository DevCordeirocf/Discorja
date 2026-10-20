import type { RoomState } from '../../../../shared/protocol';

export function endRoomSession(options: {
  room: { selfId: string } | null;
  ownerId: string | undefined;
  message: string | undefined;
  kind: 'error' | 'info';
  tellServer: boolean;
  logLeft: (reason: 'user' | 'unknown') => void;
  clearSessionTimers: () => void;
  clearResumeState: () => void;
  sendRoomClose: (type: 'close-room' | 'leave-room') => void;
  advanceSession: () => void;
  clearPending: () => void;
  clearRemoteTimer: () => void;
  stopSharing: () => void;
  clearWatchMedia: () => void;
  resetWatchSelection: () => void;
  disposePeers: () => void;
  disconnectSocket: () => void;
  stopRemoteMedia: () => void;
  resetRoomState: (
    notice: { text: string; kind: 'error' | 'info' } | null,
  ) => void;
  render: () => void;
}): void {
  const {
    room,
    ownerId,
    message,
    kind,
    tellServer,
    logLeft,
    clearSessionTimers,
    clearResumeState,
    sendRoomClose,
    advanceSession,
    clearPending,
    clearRemoteTimer,
    stopSharing,
    clearWatchMedia,
    resetWatchSelection,
    disposePeers,
    disconnectSocket,
    stopRemoteMedia,
    resetRoomState,
    render,
  } = options;
  if (room) logLeft(tellServer ? 'user' : 'unknown');
  clearSessionTimers();
  clearResumeState();
  if (tellServer && room) {
    try {
      sendRoomClose(ownerId === room.selfId ? 'close-room' : 'leave-room');
    } catch {
      // The signaling connection may already be closed.
    }
  }
  advanceSession();
  clearPending();
  clearRemoteTimer();
  stopSharing();
  clearWatchMedia();
  resetWatchSelection();
  disposePeers();
  disconnectSocket();
  stopRemoteMedia();
  resetRoomState(message ? { text: message, kind } : null);
  render();
}

export function roomCloseType(
  roomState: RoomState | null,
  selfId: string,
): 'close-room' | 'leave-room' {
  return roomState?.ownerId === selfId ? 'close-room' : 'leave-room';
}
