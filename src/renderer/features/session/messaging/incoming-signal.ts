import type { ServerMessage } from '../../../../shared/protocol';
import type { RoomPeers } from '../../../media/rtc';

type StreamSignalMessage = Extract<ServerMessage, { type: 'stream-signal' }>;
type SignalMessage = Extract<ServerMessage, { type: 'signal' }>;

export function receivePublicationSignal(
  message: StreamSignalMessage,
  options: {
    isMultiRoom: boolean;
    sharing: boolean;
    localPublicationId: string;
    watchRequest: string | null;
    watching: { publicationId: string; publisherId: string } | null;
    peers: RoomPeers | null;
    watchPeers: RoomPeers | null;
  },
): void {
  if (!options.isMultiRoom) return;
  if (options.sharing && message.publicationId === options.localPublicationId)
    void options.peers
      ?.receive(message.peerId, message.signal, false)
      .catch(() => undefined);
  else if (
    !options.watchRequest &&
    options.watching?.publicationId === message.publicationId &&
    options.watching.publisherId === message.peerId
  )
    void options.watchPeers
      ?.receive(message.peerId, message.signal, true)
      .catch(() => undefined);
}

export function receiveRoomSignal(
  message: SignalMessage,
  options: {
    room: { role: 'host' | 'viewer'; hostId?: string } | null;
    sharing: boolean;
    remoteSharing: boolean;
    viewers: Map<string, unknown>;
    peers: RoomPeers | null;
  },
): void {
  const { room, sharing, remoteSharing, viewers, peers } = options;
  if (!room) return;
  if (room.role === 'host' && (!sharing || !viewers.has(message.peerId)))
    return;
  if (
    room.role === 'viewer' &&
    (message.peerId !== room.hostId || !remoteSharing)
  )
    return;
  void peers
    ?.receive(message.peerId, message.signal, room.role === 'viewer')
    .catch(() => undefined);
}
