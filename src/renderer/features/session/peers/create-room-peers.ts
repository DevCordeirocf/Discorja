import { RoomPeers } from '../../../media/rtc';
import type {
  PeerMetrics,
  StreamPreferences,
} from '../../../../shared/quality';

export interface RoomPeerCallbacks {
  sendSignal: ConstructorParameters<typeof RoomPeers>[1];
  onRemoteStream: ConstructorParameters<typeof RoomPeers>[2];
  onConnectionState: ConstructorParameters<typeof RoomPeers>[3];
  onMetrics: (metrics: PeerMetrics[]) => void;
}

/** Creates the per-room WebRTC controller and binds its application callbacks. */
export function createRoomPeers(
  iceServers: RTCIceServer[],
  preferences: StreamPreferences,
  callbacks: RoomPeerCallbacks,
): RoomPeers {
  return new RoomPeers(
    iceServers,
    callbacks.sendSignal,
    callbacks.onRemoteStream,
    callbacks.onConnectionState,
    { preferences, onMetrics: callbacks.onMetrics },
  );
}
