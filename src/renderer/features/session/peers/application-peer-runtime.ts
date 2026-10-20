import { PublicationWatcher } from './publication-watcher';
import { createAppRoomPeers } from './app-peer-controller';

type WatcherDependencies = ConstructorParameters<typeof PublicationWatcher>[0];
type PeerDependencies = Parameters<typeof createAppRoomPeers>[0];

type SharedWatcherDependencies = Pick<
  WatcherDependencies,
  | 'getIceServers'
  | 'getPreferences'
  | 'getSessionEpoch'
  | 'getMultiState'
  | 'isRecovering'
  | 'getRemoteStream'
  | 'setRemoteStream'
  | 'setConnectionIssue'
  | 'setConnectionReconnecting'
  | 'clearRemoteTimer'
  | 'render'
>;

type PeerRuntimeDependencies = Pick<
  PeerDependencies,
  | 'getCurrent'
  | 'setCurrent'
  | 'getEpoch'
  | 'getMultiRoom'
  | 'getPublicationId'
  | 'getRoomRole'
  | 'getRemoteSharing'
  | 'getViewers'
  | 'setReconnecting'
  | 'setMetrics'
>;

export type ApplicationPeerRuntimeDependencies = SharedWatcherDependencies &
  PeerRuntimeDependencies & {
    send: WatcherDependencies['send'];
    setReceiveMuted: WatcherDependencies['setReceiveMuted'];
    setRemoteSharing: WatcherDependencies['setRemoteSharing'];
    waitForVideo: WatcherDependencies['waitForVideo'];
    logFailure: PeerDependencies['logFailure'];
    patchWatcherMetrics: WatcherDependencies['patchMetrics'];
    patchPeerMetrics: PeerDependencies['patchMetrics'];
  };

export function createApplicationPeerRuntime(
  dependencies: ApplicationPeerRuntimeDependencies,
): {
  publicationWatcher: PublicationWatcher;
  createPeers: () => void;
  clearWatchMedia: () => void;
  createWatchPeers: () => void;
} {
  const publicationWatcher = new PublicationWatcher({
    getIceServers: dependencies.getIceServers,
    getPreferences: dependencies.getPreferences,
    getSessionEpoch: dependencies.getSessionEpoch,
    getMultiState: dependencies.getMultiState,
    isRecovering: dependencies.isRecovering,
    send: dependencies.send,
    getRemoteStream: dependencies.getRemoteStream,
    setRemoteStream: dependencies.setRemoteStream,
    setReceiveMuted: dependencies.setReceiveMuted,
    setRemoteSharing: dependencies.setRemoteSharing,
    setConnectionReconnecting: dependencies.setConnectionReconnecting,
    setConnectionIssue: dependencies.setConnectionIssue,
    clearRemoteTimer: dependencies.clearRemoteTimer,
    waitForVideo: dependencies.waitForVideo,
    render: dependencies.render,
    logFailure: dependencies.logFailure,
    patchMetrics: dependencies.patchWatcherMetrics,
  });

  const createPeers = () => {
    createAppRoomPeers({
      getCurrent: dependencies.getCurrent,
      setCurrent: dependencies.setCurrent,
      getEpoch: dependencies.getEpoch,
      getIceServers: dependencies.getIceServers,
      getPreferences: dependencies.getPreferences,
      getMultiRoom: dependencies.getMultiRoom,
      getPublicationId: dependencies.getPublicationId,
      send: (message) => {
        dependencies.send(message);
      },
      getRoomRole: dependencies.getRoomRole,
      getRemoteSharing: dependencies.getRemoteSharing,
      getRemoteStream: dependencies.getRemoteStream,
      setRemoteStream: dependencies.setRemoteStream,
      getViewers: dependencies.getViewers,
      setReconnecting: dependencies.setReconnecting,
      setConnectionIssue: dependencies.setConnectionIssue,
      clearRemoteTimer: dependencies.clearRemoteTimer,
      logFailure: dependencies.logFailure,
      render: dependencies.render,
      setMetrics: dependencies.setMetrics,
      patchMetrics: dependencies.patchPeerMetrics,
    });
  };

  return {
    publicationWatcher,
    createPeers,
    clearWatchMedia: () => publicationWatcher.clearWatchMedia(),
    createWatchPeers: () => publicationWatcher.createWatchPeers(),
  };
}
