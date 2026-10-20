import type { ServerMessage } from '../../../../shared/protocol';
import type { LogEventName } from '../../../../shared/logs';

type RoomErrorMessage = Extract<ServerMessage, { type: 'error' }>;
type RoomClosedMessage = Extract<ServerMessage, { type: 'room-closed' }>;

export function handleRoomError(
  message: RoomErrorMessage,
  options: {
    isMultiRoom: boolean;
    recovering: boolean;
    hasPendingRequest: boolean;
    hasRoom: boolean;
    log: (event: LogEventName, details?: Record<string, unknown>) => void;
    stopSharing: (announce: boolean) => void;
    clearWatchMedia: () => void;
    clearWatchSelection: () => void;
    leaveRoom: (message: string, kind: 'error', tellServer: false) => void;
    notify: (message: string, kind: 'error') => void;
  },
): void {
  const {
    isMultiRoom,
    recovering,
    hasPendingRequest,
    hasRoom,
    log,
    stopSharing,
    clearWatchMedia,
    clearWatchSelection,
    leaveRoom,
    notify,
  } = options;
  log('room.rejected', { serverCode: message.code });
  if (isMultiRoom && !recovering) {
    if (
      [
        'PUBLICATION_LIMIT',
        'STALE_PUBLICATION',
        'INVALID_PUBLICATION',
      ].includes(message.code)
    )
      stopSharing(false);
    if (message.code === 'PUBLICATION_NOT_FOUND') {
      clearWatchMedia();
      clearWatchSelection();
    }
  }
  if (recovering || hasPendingRequest || !hasRoom)
    leaveRoom(message.message, 'error', false);
  else notify(message.message, 'error');
}

export function handleRoomClosed(
  message: RoomClosedMessage,
  options: {
    log: (event: LogEventName, details?: Record<string, unknown>) => void;
    leaveRoom: (message: string, kind: 'info', tellServer: false) => void;
  },
): void {
  options.log('room.closed', { reason: message.reason });
  options.leaveRoom(
    message.reason === 'expired'
      ? 'A sala expirou. Crie ou entre em uma nova sala.'
      : message.reason === 'host-left'
        ? 'A sala foi encerrada porque o dono saiu ou perdeu a conexão.'
        : 'A sala foi encerrada pelo dono.',
    'info',
    false,
  );
}
