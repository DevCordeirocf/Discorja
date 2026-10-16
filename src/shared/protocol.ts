export interface IceCandidate {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export type SignalPayload =
  | { type: 'offer' | 'answer'; sdp: string }
  | { type: 'ice'; candidate: IceCandidate };

export const ROOM_PROTOCOL_VERSION = 2;
export interface RoomParticipant {
  peerId: string;
  name: string;
  role: 'owner' | 'moderator' | 'participant';
  connected: boolean;
}
export interface RoomState {
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

export type ClientMessage =
  | { type: 'hello'; protocol: number }
  | { type: 'set-publisher'; peerId: string }
  | { type: 'set-moderator'; peerId: string; enabled: boolean }
  | { type: 'resume-room'; token: string }
  | { type: 'create-room'; name: string; roomName?: string }
  | { type: 'join-room'; code: string; name: string }
  | { type: 'signal'; peerId: string; signal: SignalPayload }
  | { type: 'kick'; peerId: string }
  | { type: 'host-state'; sharing: boolean }
  | { type: 'close-room' }
  | { type: 'leave-room' };

export type ServerMessage =
  | { type: 'hello'; protocol: 2 }
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
  getConfig(): Promise<AppConfig>;
  saveConfig(config: { signalingUrl: string }): Promise<void>;
  getSources(): Promise<CaptureSource[]>;
  selectSource(id: string, audio?: boolean): Promise<void>;
  cancelCapture(): Promise<void>;
  setSharing(sharing: boolean): Promise<void>;
  copyCode(code: string): Promise<void>;
  checkUpdates(): Promise<void>;
  downloadUpdate(): Promise<void>;
  getUpdateState(): Promise<UpdateState>;
  exportDiagnostics(report: unknown): Promise<void>;
  installUpdate(): Promise<void>;
  onUpdate(callback: (state: UpdateState) => void): () => void;
}
