export function applyLegacyHostState(options: {
  role?: 'host' | 'viewer';
  sharing: boolean;
  hasRemoteStream: boolean;
  setRemoteSharing: (sharing: boolean) => void;
  resetConnectionStatus: () => void;
  stopRemotePlayback: () => void;
  startRemotePlayback: () => void;
  render: () => void;
}): void {
  if (options.role !== 'viewer') return;
  options.setRemoteSharing(options.sharing);
  options.resetConnectionStatus();
  if (!options.sharing) options.stopRemotePlayback();
  else if (!options.hasRemoteStream) options.startRemotePlayback();
  options.render();
}
import type { ServerMessage } from '../../../../shared/protocol';

type ResumedMessage = Extract<ServerMessage, { type: 'room-resumed' }>;
type OpenedMessage = Extract<
  ServerMessage,
  { type: 'room-created' | 'room-joined' }
>;

interface LegacyRoom {
  role: 'host' | 'viewer';
  code: string;
  selfId: string;
}

export function applyLegacyRoomOpened(options: {
  message: OpenedMessage;
  pendingKind?: 'create' | 'join';
  displayName: string;
  activateRoom: () => void;
  clearPending: () => void;
  setResumeToken: (token: string) => void;
  setRoom: (room: {
    role: 'host' | 'viewer';
    code: string;
    selfId: string;
    hostId?: string;
    hostName: string;
    maxViewers: number;
  }) => void;
  setReady: () => void;
  setRemoteSharing: (sharing: boolean) => void;
  setMetricsStartedAt: (timestamp: number) => void;
  createPeers: () => void;
  waitForVideo: () => void;
  render: () => void;
}): boolean {
  const { message } = options;
  const kind = message.type === 'room-created' ? 'create' : 'join';
  if (options.pendingKind !== kind) return false;
  options.activateRoom();
  options.clearPending();
  options.setResumeToken(message.resumeToken ?? '');
  if (message.type === 'room-created') {
    options.setRoom({
      role: 'host',
      code: message.code,
      selfId: message.selfId,
      hostName: options.displayName.trim(),
      maxViewers: message.maxViewers,
    });
    options.setReady();
    options.createPeers();
    options.render();
    return true;
  }
  options.setRoom({
    role: 'viewer',
    code: message.code,
    selfId: message.selfId,
    hostId: message.hostId,
    hostName: message.hostName,
    maxViewers: 9,
  });
  options.setReady();
  options.setRemoteSharing(message.sharing);
  options.setMetricsStartedAt(message.sharing ? Date.now() : 0);
  options.createPeers();
  if (message.sharing) options.waitForVideo();
  options.render();
  return true;
}

export function applyLegacyRoomResumed(options: {
  message: ResumedMessage;
  room: LegacyRoom | null;
  signalRecovering: boolean;
  sharing: boolean;
  hasLocalStream: boolean;
  activateRoom: () => void;
  clearResumeTimers: () => void;
  setResumeToken: (token: string) => void;
  finishRecovery: () => void;
  clearViewers: () => void;
  createPeers: () => void;
  addViewer: (viewer: { peerId: string; name: string }) => void;
  offerViewer: (peerId: string) => void;
  sendHostState: (sharing: boolean) => void;
  setRemoteSharing: (sharing: boolean) => void;
  waitForVideo: () => void;
  notifyRecovered: () => void;
}): boolean {
  const { message, room } = options;
  if (
    !options.signalRecovering ||
    !room ||
    room.selfId !== message.selfId ||
    room.code !== message.code ||
    room.role !== message.role
  )
    return false;

  options.activateRoom();
  options.clearResumeTimers();
  options.setResumeToken(message.resumeToken);
  options.finishRecovery();
  options.clearViewers();
  options.createPeers();
  if (room.role === 'host') {
    for (const viewer of message.viewers) {
      options.addViewer(viewer);
      if (options.sharing && options.hasLocalStream)
        options.offerViewer(viewer.peerId);
    }
    options.sendHostState(options.sharing);
  } else {
    options.setRemoteSharing(message.sharing);
    if (message.sharing) options.waitForVideo();
  }
  options.notifyRecovered();
  return true;
}
