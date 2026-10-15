export interface IceCandidate {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
  usernameFragment?: string | null;
}

export type SignalPayload =
  | { type: 'offer' | 'answer'; sdp: string }
  | { type: 'ice'; candidate: IceCandidate };

export type ClientMessage =
  | { type: 'create-room'; name: string }
  | { type: 'join-room'; code: string; name: string }
  | { type: 'signal'; peerId: string; signal: SignalPayload }
  | { type: 'kick'; peerId: string }
  | { type: 'host-state'; sharing: boolean }
  | { type: 'close-room' }
  | { type: 'leave-room' };

export type ServerMessage =
  | { type: 'room-created'; code: string; selfId: string; maxViewers: number }
  | {
      type: 'room-joined';
      code: string;
      selfId: string;
      hostId: string;
      hostName: string;
      sharing: boolean;
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
  selectSource(id: string): Promise<void>;
  cancelCapture(): Promise<void>;
  setSharing(sharing: boolean): Promise<void>;
  copyCode(code: string): Promise<void>;
  checkUpdates(): Promise<void>;
  installUpdate(): Promise<void>;
  onUpdate(callback: (state: UpdateState) => void): () => void;
}
