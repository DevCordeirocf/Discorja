import type { RoomState } from '../../../../shared/protocol';

export interface RoomSnapshotContext {
  roomCode?: string;
  selfId?: string;
  pendingKind?: 'create' | 'join';
  signalRecovering: boolean;
}

export interface RoomSnapshotTransition {
  initial: boolean;
  resumed: boolean;
}

/** Rejects stale room snapshots before either protocol mutates session state. */
export function getRoomSnapshotTransition(
  message: RoomState,
  context: RoomSnapshotContext,
): RoomSnapshotTransition | null {
  const initial = message.reason === 'created' || message.reason === 'joined';
  if (
    initial &&
    context.pendingKind !== (message.reason === 'created' ? 'create' : 'join')
  )
    return null;
  if (
    !initial &&
    (context.roomCode !== message.code || context.selfId !== message.selfId)
  )
    return null;
  const resumed = message.reason === 'resumed';
  if (resumed && !context.signalRecovering) return null;
  return { initial, resumed };
}
