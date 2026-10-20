type PendingRoom = {
  kind: 'create' | 'join';
  timer: ReturnType<typeof setTimeout>;
};

let pendingRoom: PendingRoom | null = null;

export function setPendingRoom(
  kind: PendingRoom['kind'],
  timer: PendingRoom['timer'],
): void {
  pendingRoom = { kind, timer };
}

export function getPendingRoomKind(): PendingRoom['kind'] | undefined {
  return pendingRoom?.kind;
}

export function hasPendingRoom(): boolean {
  return pendingRoom !== null;
}

export function clearPendingRoom(): void {
  if (pendingRoom) clearTimeout(pendingRoom.timer);
  pendingRoom = null;
}
