import type { ServerMessage } from '../../../../shared/protocol';
import {
  handleViewerJoined,
  handleViewerLeft,
} from '../room-state/room-members';
import { applyLegacyHostState } from './legacy-room-messages';
import { handleRoomClosed, handleRoomError } from './message-outcomes';
import {
  applyLegacyRoomOpened,
  applyLegacyRoomResumed,
} from './legacy-room-messages';

type ResumedMessage = Extract<ServerMessage, { type: 'room-resumed' }>;
type OpenedMessage = Extract<
  ServerMessage,
  { type: 'room-created' | 'room-joined' }
>;
type ResumeOptions = Parameters<typeof applyLegacyRoomResumed>[0];
type OpenOptions = Parameters<typeof applyLegacyRoomOpened>[0];

export interface LegacySessionMessageContext {
  getRoom: () => ResumeOptions['room'];
  isRecovering: () => boolean;
  getSharing: () => boolean;
  hasLocalStream: () => boolean;
  getPendingKind: () => OpenOptions['pendingKind'];
  getDisplayName: () => string;
  activateRoom: () => void;
  clearResumeTimers: () => void;
  setResumeToken: (token: string) => void;
  finishRecovery: () => void;
  clearPending: () => void;
  setRoom: NonNullable<OpenOptions['setRoom']>;
  setReady: () => void;
  setRemoteSharing: (sharing: boolean) => void;
  setMetricsStartedAt: (timestamp: number) => void;
  createPeers: () => void;
  clearViewers: () => void;
  addViewer: (viewer: { peerId: string; name: string }) => void;
  offerViewer: (peerId: string) => void;
  sendHostState: (sharing: boolean) => void;
  waitForVideo: () => void;
  notifyRecovered: () => void;
  render: () => void;
}

export function createLegacySessionMessageController(
  context: LegacySessionMessageContext,
): {
  roomResumed: (message: ResumedMessage) => void;
  roomOpened: (message: OpenedMessage) => void;
} {
  return {
    roomResumed: (message) => {
      applyLegacyRoomResumed({
        message,
        room: context.getRoom(),
        signalRecovering: context.isRecovering(),
        sharing: context.getSharing(),
        hasLocalStream: context.hasLocalStream(),
        activateRoom: context.activateRoom,
        clearResumeTimers: context.clearResumeTimers,
        setResumeToken: context.setResumeToken,
        finishRecovery: context.finishRecovery,
        clearViewers: context.clearViewers,
        createPeers: context.createPeers,
        addViewer: context.addViewer,
        offerViewer: context.offerViewer,
        sendHostState: context.sendHostState,
        setRemoteSharing: context.setRemoteSharing,
        waitForVideo: context.waitForVideo,
        notifyRecovered: context.notifyRecovered,
      });
    },
    roomOpened: (message) => {
      applyLegacyRoomOpened({
        message,
        pendingKind: context.getPendingKind(),
        displayName: context.getDisplayName(),
        activateRoom: context.activateRoom,
        clearPending: context.clearPending,
        setResumeToken: context.setResumeToken,
        setRoom: context.setRoom,
        setReady: context.setReady,
        setRemoteSharing: context.setRemoteSharing,
        setMetricsStartedAt: context.setMetricsStartedAt,
        createPeers: context.createPeers,
        waitForVideo: context.waitForVideo,
        render: context.render,
      });
    },
  };
}

type ViewerJoinedOptions = Parameters<typeof handleViewerJoined>[0];
type ViewerLeftOptions = Parameters<typeof handleViewerLeft>[0];
type HostStateOptions = Parameters<typeof applyLegacyHostState>[0];
type RoomClosedOptions = Parameters<typeof handleRoomClosed>[1];
type RoomErrorOptions = Parameters<typeof handleRoomError>[1];
type OutcomeMessage = Extract<
  ServerMessage,
  {
    type:
      | 'viewer-joined'
      | 'viewer-left'
      | 'host-state'
      | 'room-closed'
      | 'kicked'
      | 'error';
  }
>;

export interface SessionOutcomeContext {
  getRole: () => ViewerJoinedOptions['role'];
  getMaxViewers: () => ViewerJoinedOptions['maxViewers'];
  getViewers: () => ViewerJoinedOptions['viewers'];
  isSharing: () => boolean;
  hasLocalStream: () => boolean;
  offerViewer: (peerId: string) => void;
  removePeer: ViewerLeftOptions['removePeer'];
  render: () => void;
  hasRemoteStream: () => HostStateOptions['hasRemoteStream'];
  setRemoteSharing: HostStateOptions['setRemoteSharing'];
  resetConnectionStatus: HostStateOptions['resetConnectionStatus'];
  stopRemotePlayback: HostStateOptions['stopRemotePlayback'];
  startRemotePlayback: HostStateOptions['startRemotePlayback'];
  log: RoomClosedOptions['log'] & RoomErrorOptions['log'];
  leaveRoomClosed: RoomClosedOptions['leaveRoom'];
  leaveRoomError: RoomErrorOptions['leaveRoom'];
  isMultiRoom: () => boolean;
  isRecovering: () => boolean;
  hasPendingRequest: () => boolean;
  hasRoom: () => boolean;
  stopSharing: (announce: boolean) => void;
  clearWatchMedia: () => void;
  clearWatchSelection: () => void;
  notifyError: RoomErrorOptions['notify'];
}

export function createSessionOutcomeController(
  context: SessionOutcomeContext,
): { handle: (message: OutcomeMessage) => void } {
  return {
    handle: (message) => {
      switch (message.type) {
        case 'viewer-joined':
          handleViewerJoined({
            role: context.getRole(),
            maxViewers: context.getMaxViewers(),
            viewers: context.getViewers(),
            peerId: message.peerId,
            name: message.name,
            sharing: context.isSharing(),
            hasLocalStream: context.hasLocalStream(),
            offer: context.offerViewer,
            render: context.render,
          });
          break;
        case 'viewer-left':
          handleViewerLeft({
            peerId: message.peerId,
            viewers: context.getViewers(),
            removePeer: context.removePeer,
            render: context.render,
          });
          break;
        case 'host-state':
          applyLegacyHostState({
            role: context.getRole(),
            sharing: message.sharing,
            hasRemoteStream: context.hasRemoteStream(),
            setRemoteSharing: context.setRemoteSharing,
            resetConnectionStatus: context.resetConnectionStatus,
            stopRemotePlayback: context.stopRemotePlayback,
            startRemotePlayback: context.startRemotePlayback,
            render: context.render,
          });
          break;
        case 'room-closed':
          handleRoomClosed(message, {
            log: context.log,
            leaveRoom: context.leaveRoomClosed,
          });
          break;
        case 'kicked':
          context.leaveRoomClosed('Você foi removido da sala.', 'info', false);
          break;
        case 'error':
          handleRoomError(message, {
            isMultiRoom: context.isMultiRoom(),
            recovering: context.isRecovering(),
            hasPendingRequest: context.hasPendingRequest(),
            hasRoom: context.hasRoom(),
            log: context.log,
            stopSharing: context.stopSharing,
            clearWatchMedia: context.clearWatchMedia,
            clearWatchSelection: context.clearWatchSelection,
            leaveRoom: context.leaveRoomError,
            notify: context.notifyError,
          });
          break;
      }
    },
  };
}
