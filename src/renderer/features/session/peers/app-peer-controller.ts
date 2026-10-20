import type { MultiRoomState } from '../../../../shared/protocol';
import type { PeerMetrics, StreamPreferences } from '../../../../shared/quality';
import type { RoomPeers } from '../../../media/rtc';
import { stopTracks } from '../../capture';
import { createRoomPeers } from './create-room-peers';

type Viewer = { connected: boolean; failed: boolean; reconnecting: boolean };

export function createAppRoomPeers(options: {
  getCurrent: () => RoomPeers | null;
  setCurrent: (peers: RoomPeers) => void;
  getEpoch: () => number;
  getIceServers: () => RTCIceServer[];
  getPreferences: () => StreamPreferences;
  getMultiRoom: () => MultiRoomState | null;
  getPublicationId: () => string;
  send: (message: {
    type: 'stream-signal';
    publicationId: string;
    peerId: string;
    signal: Parameters<ConstructorParameters<typeof RoomPeers>[1]>[1];
  } | {
    type: 'signal';
    peerId: string;
    signal: Parameters<ConstructorParameters<typeof RoomPeers>[1]>[1];
  }) => void;
  getRoomRole: () => 'host' | 'viewer' | undefined;
  getRemoteSharing: () => boolean;
  getRemoteStream: () => MediaStream | null;
  setRemoteStream: (stream: MediaStream | null) => void;
  getViewers: () => Map<string, Viewer>;
  setReconnecting: (value: boolean) => void;
  setConnectionIssue: (issue: string) => void;
  clearRemoteTimer: () => void;
  logFailure: (details?: Record<string, unknown>) => void;
  render: () => void;
  setMetrics: (metrics: PeerMetrics[]) => void;
  patchMetrics: () => void;
}): void {
  options.getCurrent()?.dispose();
  const epoch = options.getEpoch();
  const peers = createRoomPeers(
    options.getIceServers(),
    options.getPreferences(),
    {
      sendSignal: (peerId, signal) => {
        if (epoch !== options.getEpoch()) return;
        const multi = options.getMultiRoom();
        if (multi) {
          const publicationId = options.getPublicationId();
          if (publicationId)
            options.send({
              type: 'stream-signal',
              publicationId,
              peerId,
              signal,
            });
        } else options.send({ type: 'signal', peerId, signal });
      },
      onRemoteStream: (stream) => {
        if (
          epoch !== options.getEpoch() ||
          options.getRoomRole() !== 'viewer' ||
          !options.getRemoteSharing()
        ) {
          stopTracks(stream);
          return;
        }
        options.clearRemoteTimer();
        const previous = options.getRemoteStream();
        if (previous && previous !== stream) stopTracks(previous);
        options.setRemoteStream(stream);
        options.setReconnecting(false);
        options.setConnectionIssue('');
        for (const track of stream.getVideoTracks())
          track.onended = () => {
            if (options.getRemoteStream() === stream) {
              stopTracks(stream);
              options.setRemoteStream(null);
              options.render();
            }
          };
        for (const track of stream.getAudioTracks())
          track.onended = () => {
            if (options.getRemoteStream() === stream) options.render();
          };
        options.render();
      },
      onConnectionState: (peerId, state, details) => {
        if (epoch !== options.getEpoch()) return;
        if (state === 'failed') options.logFailure(details);
        const viewer = options.getViewers().get(peerId);
        if (viewer) {
          viewer.connected = state === 'connected';
          viewer.failed = state === 'failed';
          viewer.reconnecting = state === 'reconnecting';
        }
        if (options.getRoomRole() === 'viewer') {
          options.setReconnecting(state === 'reconnecting');
          if (state === 'failed') {
            options.clearRemoteTimer();
            stopTracks(options.getRemoteStream());
            options.setRemoteStream(null);
            options.setConnectionIssue(
              'Não foi possível manter a conexão de vídeo. Entre novamente; se persistir, a rede pode precisar de um servidor TURN.',
            );
          } else options.setConnectionIssue('');
        }
        options.render();
      },
      onMetrics: (metrics) => {
        if (epoch !== options.getEpoch()) return;
        options.setMetrics(metrics);
        options.patchMetrics();
      },
    },
  );
  options.setCurrent(peers);
}
