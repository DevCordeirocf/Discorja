import type { ServerMessage } from '../../../../shared/protocol';
import type { LogEventName } from '../../../../shared/logs';
import type { RoomPeers } from '../../../media/rtc';
import { receivePublicationSignal, receiveRoomSignal } from './incoming-signal';
import type {
  createLegacySessionMessageController,
  createSessionOutcomeController,
} from './legacy-message-controller';

type RoomStateMessage = Extract<ServerMessage, { type: 'room-state' }>;
export type PublicationOptions = Parameters<typeof receivePublicationSignal>[1];
type SignalOptions = Parameters<typeof receiveRoomSignal>[1];
type LegacyHandlers = ReturnType<typeof createLegacySessionMessageController>;
type OutcomeHandlers = ReturnType<typeof createSessionOutcomeController>;

export interface ServerMessageControllerContext {
  isMultiRoom: () => boolean;
  isSharing: () => boolean;
  getLocalPublicationId: () => string;
  getWatchRequest: () => PublicationOptions['watchRequest'];
  getWatching: () => PublicationOptions['watching'];
  getPeers: () => RoomPeers | null;
  getWatchPeers: () => RoomPeers | null;
  applyRoomState: (message: RoomStateMessage) => void;
  getRoom: () => SignalOptions['room'];
  isRemoteSharing: () => boolean;
  getViewers: () => SignalOptions['viewers'];
  legacy: LegacyHandlers;
  outcomes: OutcomeHandlers;
  log: (event: LogEventName, details?: Record<string, unknown>) => void;
}

export function createServerMessageController(
  context: ServerMessageControllerContext,
): { handle: (message: ServerMessage) => void } {
  return {
    handle: (message) => {
      if (message.type === 'room-state' && message.reason !== 'updated')
        context.log(
          message.reason === 'resumed'
            ? 'signal.resumed'
            : `room.${message.reason}`,
          { protocol: message.protocol },
        );
      switch (message.type) {
        case 'stream-signal':
          receivePublicationSignal(message, {
            isMultiRoom: context.isMultiRoom(),
            sharing: context.isSharing(),
            localPublicationId: context.getLocalPublicationId(),
            watchRequest: context.getWatchRequest(),
            watching: context.getWatching(),
            peers: context.getPeers(),
            watchPeers: context.getWatchPeers(),
          });
          break;
        case 'room-state':
          context.applyRoomState(message);
          break;
        case 'room-resumed':
          context.legacy.roomResumed(message);
          break;
        case 'room-created':
        case 'room-joined':
          context.legacy.roomOpened(message);
          break;
        case 'signal':
          receiveRoomSignal(message, {
            room: context.getRoom(),
            sharing: context.isSharing(),
            remoteSharing: context.isRemoteSharing(),
            viewers: context.getViewers(),
            peers: context.getPeers(),
          });
          break;
        case 'viewer-joined':
        case 'viewer-left':
        case 'host-state':
        case 'room-closed':
        case 'kicked':
        case 'error':
          context.outcomes.handle(message);
          break;
      }
    },
  };
}
