export interface IceCandidate {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export type SignalPayload =
  | { type: 'offer' | 'answer'; sdp: string }
  | { type: 'ice'; candidate: IceCandidate };

export const ROOM_PROTOCOL_VERSION = 5;
/** Protocols this app offers, newest first, so older servers still work. */
export const CLIENT_PROTOCOLS: readonly number[] = [ROOM_PROTOCOL_VERSION, 4];
export interface RoomParticipant {
  peerId: string;
  name: string;
  /** Protocol 4: small JPEG inside every snapshot. */
  avatar?: string;
  /** Protocol 5: content hash; the image is fetched once with get-avatar. */
  avatarId?: string;
  role: 'owner' | 'moderator' | 'participant';
  connected: boolean;
}
export interface LegacyRoomState {
  type: 'room-state';
  reason: 'created' | 'joined' | 'resumed' | 'updated';
  protocol: 2;
  code: string;
  name: string;
  selfId: string;
  ownerId: string;
  publisherId: string;
  maxParticipants: number;
  participants: RoomParticipant[];
  sharing: boolean;
  resumeToken: string;
}
export interface Publication {
  publicationId: string;
  publisherId: string;
  audio: boolean;
  connected: boolean;
  watchers: number;
}
interface MultiRoomStateFields extends Omit<LegacyRoomState, 'protocol'> {
  publications: Publication[];
  maxPublishers: number;
  watching: string | null;
  watchRequestId: string | null;
  subscribers: string[];
}
export interface MultiRoomStateV3 extends MultiRoomStateFields {
  protocol: 3;
}
export interface MultiRoomStateV4 extends MultiRoomStateFields {
  protocol: 4;
}
export interface MultiRoomStateV5 extends MultiRoomStateFields {
  protocol: 5;
}
export type MultiRoomState =
  MultiRoomStateV3 | MultiRoomStateV4 | MultiRoomStateV5;

/** A live room listed to the members of its group. */
export interface GroupRoom {
  code: string;
  name: string;
  ownerName: string;
  participants: number;
  maxParticipants: number;
  publications: number;
  members: string[];
}
export type RoomState = LegacyRoomState | MultiRoomState;

export type ClientMessage =
  | { type: 'hello'; protocol: number }
  | { type: 'set-publisher'; peerId: string }
  | { type: 'set-moderator'; peerId: string; enabled: boolean }
  | {
      type: 'publish-state';
      publicationId: string;
      sharing: boolean;
      audio: boolean;
    }
  | {
      type: 'watch-publication';
      publicationId: string | null;
      requestId: string;
    }
  | { type: 'stop-publication'; peerId: string }
  | {
      type: 'stream-signal';
      publicationId: string;
      peerId: string;
      signal: SignalPayload;
    }
  | { type: 'resume-room'; token: string }
  | {
      type: 'create-room';
      name: string;
      roomName?: string;
      avatar?: string;
      code?: string;
      /** Protocol 5: lists the room to holders of this group key. */
      groupKey?: string;
    }
  | { type: 'get-avatar'; peerId: string; avatarId: string }
  | { type: 'subscribe-group'; groupKey: string; name: string }
  | { type: 'unsubscribe-group'; groupKey: string }
  | { type: 'join-room'; code: string; name: string; avatar?: string }
  | { type: 'update-profile'; name: string; avatar: string }
  | { type: 'signal'; peerId: string; signal: SignalPayload }
  | { type: 'kick'; peerId: string }
  | { type: 'host-state'; sharing: boolean }
  | { type: 'close-room' }
  | { type: 'leave-room' };

export type ServerMessage =
  | { type: 'hello'; protocol: 2 | 3 | 4 | 5 }
  | {
      type: 'participant-avatar';
      peerId: string;
      avatarId: string;
      avatar: string;
    }
  | {
      type: 'group-state';
      groupKey: string;
      rooms: GroupRoom[];
      online: string[];
    }
  | {
      type: 'stream-signal';
      publicationId: string;
      peerId: string;
      signal: SignalPayload;
    }
  | RoomState
  | {
      type: 'room-created';
      code: string;
      selfId: string;
      maxViewers: number;
      resumeToken?: string;
    }
  | {
      type: 'room-resumed';
      code: string;
      selfId: string;
      hostId: string;
      hostName: string;
      maxViewers: number;
      sharing: boolean;
      role: 'host' | 'viewer';
      resumeToken: string;
      viewers: { peerId: string; name: string }[];
    }
  | {
      type: 'room-joined';
      code: string;
      selfId: string;
      hostId: string;
      hostName: string;
      sharing: boolean;
      resumeToken?: string;
    }
  | { type: 'viewer-joined'; peerId: string; name: string }
  | { type: 'viewer-left'; peerId: string }
  | { type: 'signal'; peerId: string; signal: SignalPayload }
  | { type: 'room-closed'; reason: 'host-left' | 'host-closed' | 'expired' }
  | { type: 'kicked' }
  | { type: 'host-state'; sharing: boolean }
  | { type: 'error'; code: string; message: string };

export interface CaptureSource {
  id: string;
  name: string;
  kind: 'screen' | 'window';
  thumbnail: string;
}

export interface AppConfig {
  signalingUrl: string;
  iceServers: RTCIceServer[];
  version: string;
  updatesConfigured: boolean;
  systemAudioSupported: boolean;
}

export interface UpdateState {
  status:
    | 'disabled'
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'downloaded'
    | 'error'
    | 'current';
  version?: string;
  percent?: number;
  message?: string;
}

export interface DiscorjaAPI {
  framelessWindow: boolean;
  minimizeWindow(): Promise<void>;
  toggleMaximizeWindow(): Promise<void>;
  closeWindow(): Promise<void>;
  recordLog(event: import('./logs.js').LogEvent): Promise<void>;
  exportLogs(): Promise<boolean>;
  getForeground(): Promise<boolean>;
  onForeground(callback: (foreground: boolean) => void): () => void;
  getConfig(): Promise<AppConfig>;
  saveConfig(config: { signalingUrl: string }): Promise<void>;
  getSources(): Promise<CaptureSource[]>;
  selectSource(id: string, audio?: boolean): Promise<void>;
  startDiscordAudioCapture(): Promise<number>;
  stopDiscordAudioCapture(): Promise<void>;
  onFilteredAudioData(callback: (data: Uint8Array) => void): () => void;
  onFilteredAudioError(callback: (message: string) => void): () => void;
  cancelCapture(): Promise<void>;
  setSharing(sharing: boolean): Promise<void>;
  copyCode(code: string): Promise<void>;
  copyGroupInvite(invite: string): Promise<void>;
  checkUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  getUpdateState(): Promise<UpdateState>;
  exportDiagnostics(report: unknown): Promise<void>;
  installUpdate(): Promise<void>;
  onUpdate(callback: (state: UpdateState) => void): () => void;
}
