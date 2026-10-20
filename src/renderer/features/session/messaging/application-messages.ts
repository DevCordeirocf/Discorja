import type { ServerMessage } from '../../../../shared/protocol';
import type { PeerMetrics } from '../../../../shared/quality';
import type { RoomPeers } from '../../../media/rtc';
import {
  createLegacySessionMessageController,
  type LegacySessionMessageContext,
  createSessionOutcomeController,
  type SessionOutcomeContext,
} from './legacy-message-controller';
import {
  createServerMessageController,
  type ServerMessageControllerContext,
} from './server-message-controller';
import type { PublicationOptions } from './server-message-controller';

type Room = Parameters<LegacySessionMessageContext['setRoom']>[0];
type Viewers = ReturnType<SessionOutcomeContext['getViewers']>;
type Effects = Pick<
  LegacySessionMessageContext,
  | 'activateRoom'
  | 'clearResumeTimers'
  | 'clearPending'
  | 'createPeers'
  | 'clearViewers'
  | 'addViewer'
  | 'offerViewer'
  | 'sendHostState'
  | 'waitForVideo'
  | 'notifyRecovered'
  | 'render'
  | 'setReady'
> &
  Pick<
    SessionOutcomeContext,
    | 'removePeer'
    | 'log'
    | 'leaveRoomClosed'
    | 'leaveRoomError'
    | 'stopSharing'
    | 'clearWatchMedia'
    | 'clearWatchSelection'
    | 'notifyError'
  > &
  Pick<ServerMessageControllerContext, 'applyRoomState'> & {
    stopRemotePlayback: (stream: MediaStream | null) => void;
  };

export interface ApplicationMessageState {
  room: Room | null;
  signalRecovering: boolean;
  sharing: boolean;
  hasLocalStream: boolean;
  pendingKind: LegacySessionMessageContext['getPendingKind'] extends () => infer T
    ? T
    : never;
  displayName: string;
  viewers: Viewers;
  remoteStream: MediaStream | null;
  connectionIssue: string;
  connectionReconnecting: boolean;
  latestMetrics: PeerMetrics[];
  metricsStartedAt: number;
  multiRoom: boolean;
  hasPendingRequest: boolean;
  hasRoom: boolean;
  localPublicationId: string;
  watchRequest: PublicationOptions['watchRequest'];
  watching: PublicationOptions['watching'];
  peers: RoomPeers | null;
  watchPeers: RoomPeers | null;
  remoteSharing: boolean;
  resumeToken: string;
}

export type ApplicationMessageStateUpdate = Partial<
  Pick<
    ApplicationMessageState,
    | 'room'
    | 'signalRecovering'
    | 'remoteStream'
    | 'connectionIssue'
    | 'connectionReconnecting'
    | 'latestMetrics'
    | 'metricsStartedAt'
    | 'remoteSharing'
    | 'resumeToken'
  >
>;

export interface ApplicationMessageDependencies {
  getState: () => ApplicationMessageState;
  updateState: (patch: ApplicationMessageStateUpdate) => void;
  effects: Effects;
}

export function createApplicationMessages(
  dependencies: ApplicationMessageDependencies,
): (message: ServerMessage) => void {
  let state = dependencies.getState();
  const updateState = (patch: ApplicationMessageStateUpdate) => {
    state = { ...state, ...patch };
    dependencies.updateState(patch);
  };
  const common = {
    getRoom: () => state.room,
    isRecovering: () => state.signalRecovering,
    getSharing: () => state.sharing,
    hasLocalStream: () => state.hasLocalStream,
    getPendingKind: () => state.pendingKind,
    getDisplayName: () => state.displayName,
    activateRoom: dependencies.effects.activateRoom,
    clearResumeTimers: dependencies.effects.clearResumeTimers,
    setResumeToken: (resumeToken: string) => updateState({ resumeToken }),
    finishRecovery: () =>
      updateState({ signalRecovering: false, connectionReconnecting: false }),
    clearPending: dependencies.effects.clearPending,
    setRoom: (room: Room) => updateState({ room }),
    setReady: dependencies.effects.setReady,
    setRemoteSharing: (remoteSharing: boolean) =>
      updateState({ remoteSharing }),
    setMetricsStartedAt: (metricsStartedAt: number) =>
      updateState({ metricsStartedAt }),
    createPeers: dependencies.effects.createPeers,
    clearViewers: dependencies.effects.clearViewers,
    addViewer: dependencies.effects.addViewer,
    offerViewer: dependencies.effects.offerViewer,
    sendHostState: dependencies.effects.sendHostState,
    waitForVideo: dependencies.effects.waitForVideo,
    notifyRecovered: dependencies.effects.notifyRecovered,
    render: dependencies.effects.render,
    getRole: () => state.room?.role,
    getMaxViewers: () => state.room?.maxViewers,
    getViewers: () => state.viewers,
    isSharing: () => state.sharing,
    removePeer: dependencies.effects.removePeer,
    hasRemoteStream: () => !!state.remoteStream,
    resetConnectionStatus: () =>
      updateState({ connectionIssue: '', connectionReconnecting: false }),
    stopRemotePlayback: () => {
      dependencies.effects.stopRemotePlayback(state.remoteStream);
      updateState({
        latestMetrics: [],
        metricsStartedAt: 0,
        remoteStream: null,
      });
    },
    startRemotePlayback: () => {
      updateState({ metricsStartedAt: Date.now() });
      dependencies.effects.waitForVideo();
    },
    log: dependencies.effects.log,
    leaveRoomClosed: dependencies.effects.leaveRoomClosed,
    leaveRoomError: dependencies.effects.leaveRoomError,
    isMultiRoom: () => state.multiRoom,
    hasPendingRequest: () => state.hasPendingRequest,
    hasRoom: () => state.hasRoom,
    stopSharing: dependencies.effects.stopSharing,
    clearWatchMedia: dependencies.effects.clearWatchMedia,
    clearWatchSelection: dependencies.effects.clearWatchSelection,
    notifyError: dependencies.effects.notifyError,
    getLocalPublicationId: () => state.localPublicationId,
    getWatchRequest: () => state.watchRequest,
    getWatching: () => state.watching,
    getPeers: () => state.peers,
    getWatchPeers: () => state.watchPeers,
    applyRoomState: dependencies.effects.applyRoomState,
    isRemoteSharing: () => state.remoteSharing,
  };
  const legacy = createLegacySessionMessageController(common);
  const outcomes = createSessionOutcomeController(common);
  const server = createServerMessageController({ ...common, legacy, outcomes });
  return (message) => {
    state = dependencies.getState();
    server.handle(message);
  };
}
