import type { MultiRoomState, RoomState } from '../../../../shared/protocol';
import { applyMultiRoomSnapshot } from './multi-room-snapshot';
import { applyLegacyRoomSnapshot } from './legacy-room-snapshot';

type MultiContext = Parameters<typeof applyMultiRoomSnapshot>[1];
type LegacyContext = Parameters<typeof applyLegacyRoomSnapshot>[1];
type MultiEffects = Parameters<typeof applyMultiRoomSnapshot>[2];
type LegacyEffects = Parameters<typeof applyLegacyRoomSnapshot>[2];

export function createAppSnapshotController(options: {
  getMultiContext(): MultiContext;
  getLegacyContext(): LegacyContext;
  activateRoom: MultiEffects['activateRoom'];
  finishInitialConnection: MultiEffects['finishInitialConnection'];
  finishRecovery: MultiEffects['finishRecovery'];
  saveMultiSnapshot: MultiEffects['saveSnapshot'];
  confirmPublication: MultiEffects['confirmPublication'];
  stopUnconfirmedPublication: MultiEffects['stopUnconfirmedPublication'];
  syncSubscribers: MultiEffects['syncSubscribers'];
  createPeers: MultiEffects['createPeers'];
  offerSubscriber: MultiEffects['offerSubscriber'];
  setWatching: MultiEffects['setWatching'];
  clearWatchMedia: MultiEffects['clearWatchMedia'];
  clearWatchRequest: MultiEffects['clearWatchRequest'];
  createWatchPeers: MultiEffects['createWatchPeers'];
  requestPublication: MultiEffects['requestPublication'];
  resetChangedPublisher: LegacyEffects['resetChangedPublisher'];
  saveLegacySnapshot: LegacyEffects['saveSnapshot'];
  syncViewers: LegacyEffects['syncViewers'];
  sendHostState: LegacyEffects['sendHostState'];
  offerViewer: LegacyEffects['offerViewer'];
  setRemoteSharing: LegacyEffects['setRemoteSharing'];
  stopRemotePlayback: LegacyEffects['stopRemotePlayback'];
  startRemotePlayback: LegacyEffects['startRemotePlayback'];
  notifyRecovered: MultiEffects['notifyRecovered'];
  render: () => void;
}): {
  applyMultiRoomState(message: MultiRoomState): void;
  applyRoomState(message: RoomState): void;
} {
  function applyMultiRoomState(message: MultiRoomState): void {
    applyMultiRoomSnapshot(message, options.getMultiContext(), {
      activateRoom: options.activateRoom,
      finishInitialConnection: options.finishInitialConnection,
      finishRecovery: options.finishRecovery,
      saveSnapshot: options.saveMultiSnapshot,
      confirmPublication: options.confirmPublication,
      stopUnconfirmedPublication: options.stopUnconfirmedPublication,
      syncSubscribers: options.syncSubscribers,
      createPeers: options.createPeers,
      offerSubscriber: options.offerSubscriber,
      setWatching: options.setWatching,
      clearWatchMedia: options.clearWatchMedia,
      clearWatchRequest: options.clearWatchRequest,
      createWatchPeers: options.createWatchPeers,
      requestPublication: options.requestPublication,
      notifyRecovered: options.notifyRecovered,
      render: options.render,
    });
  }

  function applyRoomState(message: RoomState): void {
    if (message.protocol !== 2) {
      applyMultiRoomState(message);
      return;
    }
    applyLegacyRoomSnapshot(message, options.getLegacyContext(), {
      activateRoom: options.activateRoom,
      resetChangedPublisher: options.resetChangedPublisher,
      finishInitialConnection: options.finishInitialConnection,
      finishRecovery: options.finishRecovery,
      saveSnapshot: options.saveLegacySnapshot,
      syncViewers: options.syncViewers,
      createPeers: options.createPeers,
      sendHostState: options.sendHostState,
      offerViewer: options.offerViewer,
      setRemoteSharing: options.setRemoteSharing,
      stopRemotePlayback: options.stopRemotePlayback,
      startRemotePlayback: options.startRemotePlayback,
      notifyRecovered: options.notifyRecovered,
      render: options.render,
    });
  }

  return { applyMultiRoomState, applyRoomState };
}
