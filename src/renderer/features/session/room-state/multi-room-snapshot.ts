import type { MultiRoomState, Publication } from '../../../../shared/protocol';
import { getRoomSnapshotTransition } from './room-snapshot';

export interface MultiRoomSnapshotContext {
  roomCode?: string;
  selfId?: string;
  pendingKind?: 'create' | 'join';
  signalRecovering: boolean;
  localPublicationId: string;
  publicationConfirmed: boolean;
  sharing: boolean;
  hasLocalStream: boolean;
  watchRequest: string | null;
  watching: Publication | null;
  hasPeers: boolean;
}

export interface MultiRoomSnapshotEffects {
  activateRoom: () => void;
  finishInitialConnection: () => void;
  finishRecovery: () => void;
  saveSnapshot: (
    message: MultiRoomState,
    room: {
      role: 'host';
      code: string;
      selfId: string;
      hostId: string;
      hostName: string;
      maxViewers: number;
    },
  ) => void;
  confirmPublication: () => void;
  stopUnconfirmedPublication: () => void;
  syncSubscribers: (members: { id: string; name: string }[]) => Set<string>;
  createPeers: () => void;
  offerSubscriber: (id: string) => void;
  setWatching: (publication: Publication | null) => void;
  clearWatchMedia: () => void;
  clearWatchRequest: () => void;
  createWatchPeers: () => void;
  requestPublication: (publicationId: string | null, requestId: string) => void;
  notifyRecovered: () => void;
  render: () => void;
}

export function applyMultiRoomSnapshot(
  message: MultiRoomState,
  context: MultiRoomSnapshotContext,
  effects: MultiRoomSnapshotEffects,
): boolean {
  const transition = getRoomSnapshotTransition(message, context);
  if (!transition) return false;
  const { initial, resumed } = transition;
  effects.activateRoom();
  if (initial) effects.finishInitialConnection();
  if (resumed) effects.finishRecovery();

  const owner = message.participants.find(
    (participant) => participant.peerId === message.ownerId,
  )!;
  effects.saveSnapshot(message, {
    role: 'host',
    code: message.code,
    selfId: message.selfId,
    hostId: message.ownerId,
    hostName: owner.name,
    maxViewers: message.maxParticipants - 1,
  });

  const ownPublication = message.publications.find(
    (publication) => publication.publisherId === message.selfId,
  );
  if (ownPublication?.publicationId === context.localPublicationId)
    effects.confirmPublication();
  else if (context.sharing && context.publicationConfirmed)
    effects.stopUnconfirmedPublication();

  const participantNames = new Map(
    message.participants.map((participant) => [
      participant.peerId,
      participant.name,
    ]),
  );
  const previousSubscribers = effects.syncSubscribers(
    message.subscribers.map((id) => ({ id, name: participantNames.get(id)! })),
  );
  if (initial || resumed || !context.hasPeers) effects.createPeers();
  if (
    context.sharing &&
    context.hasLocalStream &&
    ownPublication?.publicationId === context.localPublicationId
  )
    for (const id of message.subscribers)
      if (resumed || !previousSubscribers.has(id)) effects.offerSubscriber(id);

  if (
    !context.watchRequest ||
    context.watchRequest === message.watchRequestId
  ) {
    effects.clearWatchRequest();
    const selected =
      message.publications.find(
        (publication) => publication.publicationId === message.watching,
      ) ?? null;
    const changed =
      selected?.publicationId !== context.watching?.publicationId ||
      selected?.connected !== context.watching?.connected ||
      resumed;
    if (changed) {
      effects.clearWatchMedia();
      effects.setWatching(selected);
      if (selected) effects.createWatchPeers();
    } else effects.setWatching(selected);
  } else if (resumed) {
    const selected =
      message.publications.find(
        (publication) =>
          publication.publicationId === context.watching?.publicationId,
      ) ?? null;
    effects.clearWatchMedia();
    effects.setWatching(selected);
    effects.createWatchPeers();
    effects.requestPublication(
      selected?.publicationId ?? null,
      context.watchRequest,
    );
  }

  if (resumed) effects.notifyRecovered();
  else effects.render();
  return true;
}
