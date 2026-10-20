import type { RoomPeers } from '../../media/rtc';
import type { SignalConnection } from '../../transport/signal';
import type { PublicationWatcher } from '../../features/session';

type RuntimeLifecycleOptions = {
  isDeferredRender: () => boolean;
  render: () => void;
  syncPreviews: () => void;
  patchMetrics: () => void;
  onDeviceChange: () => void;
  getHasRoom: () => boolean;
  sendRoomClose: () => void;
  incrementSession: () => void;
  stopLocalTracks: () => void;
  stopRemoteTracks: () => void;
  publicationWatcher: PublicationWatcher;
  getPeers: () => RoomPeers | null;
  getSocket: () => SignalConnection | null;
  setSharingFalse: () => void;
};

export function bindRuntimeLifecycle(options: RuntimeLifecycleOptions): void {
  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement && options.isDeferredRender())
      options.render();
  });
  window.addEventListener('blur', options.syncPreviews);
  window.addEventListener('focus', options.syncPreviews);
  document.addEventListener('visibilitychange', options.syncPreviews);
  const metricsTimer = setInterval(options.patchMetrics, 2_000);
  navigator.mediaDevices?.addEventListener(
    'devicechange',
    options.onDeviceChange,
  );

  window.addEventListener('beforeunload', () => {
    clearInterval(metricsTimer);
    if (options.getHasRoom()) {
      try {
        options.sendRoomClose();
      } catch {
        /* Window is closing. */
      }
    }
    options.incrementSession();
    options.stopLocalTracks();
    options.stopRemoteTracks();
    options.publicationWatcher.dispose();
    options.getPeers()?.dispose();
    options.getSocket()?.disconnect();
    options.setSharingFalse();
  });
}
