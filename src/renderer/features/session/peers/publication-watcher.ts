import type {
  ClientMessage,
  MultiRoomState,
  Publication,
} from '../../../../shared/protocol';
import type {
  PeerMetrics,
  StreamPreferences,
} from '../../../../shared/quality';
import { RoomPeers } from '../../../media/rtc';
import { stopTracks } from '../../capture';

type Send = (message: ClientMessage) => boolean;

export class PublicationWatcher {
  private selected: Publication | null = null;
  private requestId: string | null = null;
  private peers: RoomPeers | null = null;
  private generation = 0;
  private retryAttempts = 0;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private metrics: PeerMetrics[] = [];
  private metricsStartedAt = 0;

  constructor(
    private readonly dependencies: {
      getIceServers: () => RTCIceServer[];
      getPreferences: () => StreamPreferences;
      getSessionEpoch: () => number;
      getMultiState: () => MultiRoomState | null;
      isRecovering: () => boolean;
      send: Send;
      getRemoteStream: () => MediaStream | null;
      setRemoteStream: (stream: MediaStream | null) => void;
      setReceiveMuted: (muted: boolean) => void;
      setRemoteSharing: (sharing: boolean) => void;
      setConnectionReconnecting: (reconnecting: boolean) => void;
      setConnectionIssue: (message: string) => void;
      clearRemoteTimer: () => void;
      waitForVideo: () => void;
      render: () => void;
      logFailure: (details: Record<string, unknown>) => void;
      patchMetrics: (metrics: PeerMetrics[]) => void;
    },
  ) {}

  get watching(): Publication | null {
    return this.selected;
  }

  get watchRequest(): string | null {
    return this.requestId;
  }

  get watchPeers(): RoomPeers | null {
    return this.peers;
  }

  get incomingMetrics(): PeerMetrics[] {
    return this.metrics;
  }

  get incomingMetricsStartedAt(): number {
    return this.metricsStartedAt;
  }

  setWatching(publication: Publication | null): void {
    this.selected = publication;
  }

  clearWatchRequest(): void {
    this.requestId = null;
  }

  clearWatchMedia(): void {
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.generation++;
    this.peers?.dispose();
    this.peers = null;
    stopTracks(this.dependencies.getRemoteStream());
    this.dependencies.setRemoteStream(null);
    this.metrics = [];
    this.metricsStartedAt = 0;
    this.dependencies.setRemoteSharing(false);
    this.dependencies.setConnectionIssue('');
    this.dependencies.setConnectionReconnecting(false);
    this.dependencies.clearRemoteTimer();
  }

  createWatchPeers(): void {
    if (!this.selected || !this.selected.connected) return;
    this.metricsStartedAt = Date.now();
    const publication = this.selected;
    const sessionEpoch = this.dependencies.getSessionEpoch();
    const generation = this.generation;
    const current = () =>
      sessionEpoch === this.dependencies.getSessionEpoch() &&
      generation === this.generation &&
      this.selected?.publicationId === publication.publicationId;

    this.peers = new RoomPeers(
      this.dependencies.getIceServers(),
      (peerId, signal) => {
        if (current())
          this.dependencies.send({
            type: 'stream-signal',
            publicationId: publication.publicationId,
            peerId,
            signal,
          });
      },
      (stream) => this.onRemoteStream(stream, current),
      (_peerId, state, details) =>
        this.onConnectionState(state, details ?? {}, current, publication),
      {
        preferences: this.dependencies.getPreferences(),
        onQueueOverflow: () =>
          this.dependencies.logFailure({ reason: 'rejected' }),
        onMetrics: (metrics) => {
          if (!current()) return;
          this.metrics = metrics;
          this.dependencies.patchMetrics(metrics);
        },
      },
    );
    this.dependencies.setRemoteSharing(true);
    this.dependencies.waitForVideo();
  }

  selectPublication(id: string | null, recovery = false): void {
    const state = this.dependencies.getMultiState();
    if (!state || this.dependencies.isRecovering()) return;
    if (!recovery) this.retryAttempts = 0;
    const publication = state.publications.find(
      (entry) =>
        entry.publicationId === id && entry.publisherId !== state.selfId,
    );
    if (id !== null && !publication) return;
    this.clearWatchMedia();
    this.selected = publication ?? null;
    this.dependencies.setReceiveMuted(true);
    this.requestId = crypto.randomUUID();
    this.createWatchPeers();
    this.dependencies.send({
      type: 'watch-publication',
      publicationId: id,
      requestId: this.requestId,
    });
    this.dependencies.render();
  }

  dispose(): void {
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.generation++;
    this.peers?.dispose();
    this.peers = null;
  }

  private onRemoteStream(stream: MediaStream, current: () => boolean): void {
    if (!current()) {
      stopTracks(stream);
      return;
    }
    const previous = this.dependencies.getRemoteStream();
    if (previous && previous !== stream) stopTracks(previous);
    this.dependencies.setRemoteStream(stream);
    this.dependencies.setConnectionIssue('');
    this.dependencies.setConnectionReconnecting(false);
    this.retryAttempts = 0;
    clearTimeout(this.retryTimer);
    this.retryTimer = undefined;
    this.dependencies.clearRemoteTimer();
    for (const track of stream.getVideoTracks())
      track.onended = () => {
        if (!current()) return;
        stopTracks(this.dependencies.getRemoteStream());
        this.dependencies.setRemoteStream(null);
        this.dependencies.render();
      };
    for (const track of stream.getAudioTracks())
      track.onended = () => {
        if (current()) this.dependencies.render();
      };
    this.dependencies.render();
  }

  private onConnectionState(
    state: RTCPeerConnectionState | 'reconnecting',
    details: Record<string, unknown>,
    current: () => boolean,
    publication: Publication,
  ): void {
    if (!current()) return;
    this.dependencies.setConnectionReconnecting(state === 'reconnecting');
    if (state === 'failed') {
      this.dependencies.logFailure(details);
      stopTracks(this.dependencies.getRemoteStream());
      this.dependencies.setRemoteStream(null);
      const publisherName =
        this.dependencies
          .getMultiState()
          ?.participants.find(
            (person) => person.peerId === publication.publisherId,
          )?.name ?? 'este participante';
      this.dependencies.setConnectionIssue(
        `Não foi possível conectar seu dispositivo à tela de ${publisherName}. A conexão entre essas duas redes pode estar bloqueada por roteador/NAT, firewall ou VPN. Por isso, outras pessoas podem conseguir assistir enquanto você não. Tente novamente ou teste outra rede; se persistir, pode ser necessário configurar um servidor TURN.`,
      );
      if (this.retryAttempts < 2 && !this.retryTimer) {
        this.retryTimer = setTimeout(() => {
          this.retryTimer = undefined;
          this.retryAttempts++;
          this.selectPublication(publication.publicationId, true);
        }, 1500);
      }
    }
    this.dependencies.render();
  }
}
