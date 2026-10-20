import type { RoomState } from '../../../../shared/protocol';
import { getRoomSnapshotTransition } from './room-snapshot';

type LegacyRoomState = Extract<RoomState, { protocol: 2 }>;

export function applyLegacyRoomSnapshot(
  message: LegacyRoomState,
  context: {
    roomCode?: string;
    selfId?: string;
    pendingKind?: 'create' | 'join';
    signalRecovering: boolean;
    previousPublisherId?: string;
    hasPeers: boolean;
    sharing: boolean;
    hasLocalStream: boolean;
    remoteSharing: boolean;
  },
  effects: {
    activateRoom: () => void;
    resetChangedPublisher: () => void;
    finishInitialConnection: () => void;
    finishRecovery: () => void;
    saveSnapshot: (
      message: LegacyRoomState,
      room: {
        role: 'host' | 'viewer';
        code: string;
        selfId: string;
        hostId: string;
        hostName: string;
        maxViewers: number;
      },
    ) => void;
    syncViewers: (members: { id: string; name: string }[]) => Set<string>;
    createPeers: () => void;
    sendHostState: (sharing: boolean) => void;
    offerViewer: (peerId: string) => void;
    setRemoteSharing: (sharing: boolean) => void;
    stopRemotePlayback: () => void;
    startRemotePlayback: () => void;
    notifyRecovered: () => void;
    render: () => void;
  },
): boolean {
  const transition = getRoomSnapshotTransition(message, context);
  if (!transition) return false;
  const { initial, resumed } = transition;
  const nextHost = message.publisherId === message.selfId;
  const changed =
    !initial && context.previousPublisherId !== message.publisherId;

  effects.activateRoom();
  if (changed) effects.resetChangedPublisher();
  if (initial) effects.finishInitialConnection();
  if (resumed) effects.finishRecovery();

  const publisher = message.participants.find(
    (participant) => participant.peerId === message.publisherId,
  )!;
  effects.saveSnapshot(message, {
    role: nextHost ? 'host' : 'viewer',
    code: message.code,
    selfId: message.selfId,
    hostId: message.publisherId,
    hostName: publisher.name,
    maxViewers: message.maxParticipants - 1,
  });

  const activeViewers = message.participants.filter(
    (participant) =>
      participant.peerId !== message.publisherId && participant.connected,
  );
  const previousViewers = effects.syncViewers(
    activeViewers.map((participant) => ({
      id: participant.peerId,
      name: participant.name,
    })),
  );
  if (initial || changed || resumed || !context.hasPeers) effects.createPeers();
  if (nextHost) {
    if (resumed)
      effects.sendHostState(context.sharing && context.hasLocalStream);
    if (context.sharing && context.hasLocalStream)
      for (const viewer of activeViewers)
        if (
          initial ||
          changed ||
          resumed ||
          !previousViewers.has(viewer.peerId)
        )
          effects.offerViewer(viewer.peerId);
  } else {
    const wasSharing = context.remoteSharing;
    effects.setRemoteSharing(message.sharing);
    if (!message.sharing) effects.stopRemotePlayback();
    else if (!wasSharing || initial || changed || resumed)
      effects.startRemotePlayback();
  }

  if (resumed) effects.notifyRecovered();
  else effects.render();
  return true;
}
