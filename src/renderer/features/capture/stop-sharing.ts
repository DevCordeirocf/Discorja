import type { ClientMessage } from '../../../shared/protocol';
import type { StreamPreferences } from '../../../shared/quality';

export function stopSharingSession(options: {
  announce: boolean;
  isHost: boolean;
  isMultiRoom: boolean;
  preferences: StreamPreferences;
  takePublicationId: () => string;
  resetCaptureState: () => void;
  stopAudioPipeline: () => void;
  stopLocalTracks: () => void;
  clearLocalStream: () => void;
  clearPeerConnections: () => void;
  configurePeers: (preferences: StreamPreferences) => void;
  resetBusyAndModal: () => void;
  cancelCapture: () => void;
  setNativeSharing: (value: boolean) => void;
  send: (message: ClientMessage) => boolean;
}): void {
  const {
    announce,
    isHost,
    isMultiRoom,
    preferences,
    takePublicationId,
    resetCaptureState,
    stopAudioPipeline,
    stopLocalTracks,
    clearLocalStream,
    clearPeerConnections,
    configurePeers,
    resetBusyAndModal,
    cancelCapture,
    setNativeSharing,
    send,
  } = options;
  const publicationId = takePublicationId();
  resetCaptureState();
  stopAudioPipeline();
  stopLocalTracks();
  clearLocalStream();
  clearPeerConnections();
  configurePeers(preferences);
  resetBusyAndModal();
  cancelCapture();
  setNativeSharing(false);
  if (!announce || !isHost) return;
  if (isMultiRoom) {
    if (publicationId)
      send({
        type: 'publish-state',
        publicationId,
        sharing: false,
        audio: false,
      });
  } else send({ type: 'host-state', sharing: false });
}
