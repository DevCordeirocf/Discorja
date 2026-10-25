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
  | 'getPublicationId'
  | 'getRoomRole'
  | 'getRemoteSharing'
  | 'getViewers'
  | 'setMetrics'
>;

export type ApplicationPeerRuntimeDependencies = SharedWatcherDependencies &
  PeerRuntimeDependencies & {
    send: WatcherDependencies['send'];
    setReceiveMuted: WatcherDependencies['setReceiveMuted'];
    setRemoteSharing: WatcherDependencies['setRemoteSharing'];
    waitForVideo: WatcherDependencies['waitForVideo'];
    logFailure: PeerDependencies['logFailure'];
    patchMetrics: () => void;
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
    patchMetrics: dependencies.patchMetrics,
  });

  const createPeers = () => {
    createAppRoomPeers({
      getCurrent: dependencies.getCurrent,
      setCurrent: dependencies.setCurrent,
      getEpoch: dependencies.getSessionEpoch,
      getIceServers: dependencies.getIceServers,
      getPreferences: dependencies.getPreferences,
      getMultiRoom: dependencies.getMultiState,
      getPublicationId: dependencies.getPublicationId,
      send: (message) => {
        dependencies.send(message);
      },
      getRoomRole: dependencies.getRoomRole,
      getRemoteSharing: dependencies.getRemoteSharing,
      getRemoteStream: dependencies.getRemoteStream,
      setRemoteStream: dependencies.setRemoteStream,
      getViewers: dependencies.getViewers,
      setReconnecting: dependencies.setConnectionReconnecting,
      setConnectionIssue: dependencies.setConnectionIssue,
      clearRemoteTimer: dependencies.clearRemoteTimer,
      logFailure: dependencies.logFailure,
      render: dependencies.render,
      setMetrics: dependencies.setMetrics,
      patchMetrics: dependencies.patchMetrics,
    });
  };

  return {
    publicationWatcher,
    createPeers,
    clearWatchMedia: () => publicationWatcher.clearWatchMedia(),
    createWatchPeers: () => publicationWatcher.createWatchPeers(),
  };
}
