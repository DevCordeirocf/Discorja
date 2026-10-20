export interface RoomMemberView {
  id: string;
  name: string;
}

export interface RoomMemberState {
  name: string;
  connected: boolean;
  failed: boolean;
  reconnecting: boolean;
}

export function createRoomMemberState(name: string): RoomMemberState {
  return { name, connected: false, failed: false, reconnecting: false };
}

export function handleViewerJoined(options: {
  role?: 'host' | 'viewer';
  maxViewers?: number;
  viewers: Map<string, RoomMemberState>;
  peerId: string;
  name: string;
  sharing: boolean;
  hasLocalStream: boolean;
  offer: (peerId: string) => void;
  render: () => void;
}): void {
  if (options.role !== 'host') return;
  if (
    !options.viewers.has(options.peerId) &&
    options.viewers.size >= (options.maxViewers ?? 0)
  )
    return;
  options.viewers.set(options.peerId, createRoomMemberState(options.name));
  if (options.sharing && options.hasLocalStream) options.offer(options.peerId);
  options.render();
}

export function handleViewerLeft(options: {
  peerId: string;
  viewers: Map<string, RoomMemberState>;
  removePeer: (peerId: string) => void;
  render: () => void;
}): void {
  options.removePeer(options.peerId);
  options.viewers.delete(options.peerId);
  options.render();
}

/** Reconciles the UI member map and returns its previous IDs for reconnect logic. */
export function syncRoomMembers(
  members: RoomMemberView[],
  current: Map<string, RoomMemberState>,
  removePeer: (id: string) => void,
): Set<string> {
  const previousIds = new Set(current.keys());
  const nextIds = new Set(members.map((member) => member.id));
  for (const id of current.keys()) {
    if (nextIds.has(id)) continue;
    removePeer(id);
    current.delete(id);
  }
  for (const member of members) {
    if (current.has(member.id)) continue;
    current.set(member.id, createRoomMemberState(member.name));
  }
  return previousIds;
}
