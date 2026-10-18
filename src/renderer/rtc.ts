import type { SignalPayload } from '../shared/protocol';
import {
  DEFAULT_STREAM_PREFERENCES,
  normalizePreferences,
  type PeerConnectionStatus,
  type PeerMetrics,
  type StreamPreferences,
} from '../shared/quality';
import { AdaptiveQuality, resolutionScale } from './adaptation';
import { PeerTelemetry } from './telemetry';
import { AUDIO_MAX_BITRATE, AUDIO_UPLOAD_RESERVE } from '../shared/audio';

interface Peer {
  connection: RTCPeerConnection;
  role: 'host' | 'viewer';
  incoming: RTCIceCandidateInit[];
  remoteUfrags: Set<string>;
  retiredUfrags: Set<string>;
  operations: Promise<void>;
  queued: number;
  controller: AdaptiveQuality;
  telemetry: PeerTelemetry;
  metrics?: PeerMetrics;
  dirty: boolean;
  parameterError: boolean;
  retryParametersAt: number;
  appliedTarget?: string;
  recovering: boolean;
  failed: boolean;
  lastState?: PeerConnectionStatus;
  restartAttempts: number;
  restartInFlight: boolean;
  receivedStream?: MediaStream;
  setupTimer?: ReturnType<typeof setTimeout>;
  disconnectedTimer?: ReturnType<typeof setTimeout>;
  restartTimer?: ReturnType<typeof setTimeout>;
}

export interface RoomPeerOptions {
  preferences: StreamPreferences;
  onMetrics?: (metrics: PeerMetrics[]) => void;
}

const ufrags = (sdp: string): Set<string> =>
  new Set(
    [...sdp.matchAll(/^a=ice-ufrag:([^\r\n]+)/gmu)].map((match) => match[1]),
  );
const candidateUfrag = (candidate: RTCIceCandidateInit): string | undefined =>
  candidate.usernameFragment ??
  candidate.candidate?.match(/(?:^|\s)ufrag\s+(\S+)/u)?.[1];

/** One PC and adaptive encoder per viewer. Capture remains under renderer control. */
export class RoomPeers {
  private readonly peers = new Map<string, Peer>();
  private readonly waitingIce = new Map<string, RTCIceCandidateInit[]>();
  private preferences: StreamPreferences;
  private disposed = false;
  private pollTimer?: ReturnType<typeof setTimeout>;
  private pollInFlight = false;
  private epoch = 0;

  constructor(
    private readonly iceServers: RTCIceServer[],
    private readonly send: (peerId: string, signal: SignalPayload) => void,
    private readonly onStream: (stream: MediaStream) => void,
    private readonly onState: (
      peerId: string,
      state: PeerConnectionStatus,
      details?: {
        connectionState: RTCPeerConnectionState;
        iceConnectionState: RTCIceConnectionState;
        role: Peer['role'];
      },
    ) => void,
    private readonly options?: RoomPeerOptions,
  ) {
    this.preferences = normalizePreferences(
      options?.preferences ?? DEFAULT_STREAM_PREFERENCES,
    );
  }

  /** Adopts desired settings synchronously. Unsupported encoder controls remain nonfatal. */
  async configure(preferences: StreamPreferences): Promise<void> {
    this.preferences = normalizePreferences(preferences);
    if (this.disposed) return;
    for (const peer of this.peers.values()) {
      peer.controller.configure(this.preferences);
      peer.dirty = true;
      peer.retryParametersAt = 0;
    }
    await this.rebalance();
  }

  private create(peerId: string, role: Peer['role']): Peer {
    const incoming = this.waitingIce.get(peerId) ?? [];
    this.remove(peerId);
    const connection = new RTCPeerConnection({ iceServers: this.iceServers });
    const peer: Peer = {
      connection,
      role,
      incoming,
      remoteUfrags: new Set(),
      retiredUfrags: new Set(),
      operations: Promise.resolve(),
      queued: 0,
      controller: new AdaptiveQuality(this.preferences),
      telemetry: new PeerTelemetry(),
      dirty: true,
      parameterError: false,
      retryParametersAt: 0,
      recovering: false,
      failed: false,
      restartAttempts: 0,
      restartInFlight: false,
    };
    this.peers.set(peerId, peer);
    peer.setupTimer = setTimeout(() => this.recover(peerId, peer), 20_000);
    connection.onicecandidate = ({ candidate }) => {
      if (candidate && this.current(peerId, peer))
        this.send(peerId, {
          type: 'ice',
          candidate: candidate.toJSON() as { candidate: string },
        });
    };
    connection.ontrack = (event) => {
      if (!this.current(peerId, peer)) return;
      // A streamless audio event must not replace (and hide) the video stream.
      peer.receivedStream ??= event.streams[0] ?? new MediaStream();
      if (!peer.receivedStream.getTracks().includes(event.track))
        peer.receivedStream.addTrack(event.track);
      this.onStream(peer.receivedStream);
    };
    const stateChanged = () => {
      if (!this.current(peerId, peer)) return;
      const state = connection.connectionState;
      const ice = connection.iceConnectionState;
      if (state === 'failed' || ice === 'failed') {
        this.recover(peerId, peer);
        return;
      }
      if (state === 'disconnected' || ice === 'disconnected') {
        this.markRecovering(peerId, peer);
        peer.disconnectedTimer ??= setTimeout(() => {
          peer.disconnectedTimer = undefined;
          if (
            this.current(peerId, peer) &&
            (connection.connectionState === 'disconnected' ||
              connection.iceConnectionState === 'disconnected')
          )
            this.recover(peerId, peer);
        }, 8_000);
        return;
      }
      if (state === 'connected') {
        this.clearRecoveryTimers(peer);
        peer.recovering = peer.failed = false;
        peer.restartAttempts = 0;
        this.notify(peerId, peer, 'connected');
        void this.rebalance();
        this.emitMetrics();
      }
    };
    connection.onconnectionstatechange = stateChanged;
    connection.oniceconnectionstatechange = stateChanged;
    connection.onsignalingstatechange = () => {
      if (
        this.current(peerId, peer) &&
        connection.signalingState === 'stable'
      ) {
        peer.retryParametersAt = 0;
        void this.run(peerId, peer, () => this.applyParameters(peerId, peer));
      }
    };
    this.schedulePoll();
    return peer;
  }

  private current(peerId: string, peer: Peer): boolean {
    return !this.disposed && this.peers.get(peerId) === peer;
  }

  /** Serializes SDP, candidates and parameter transactions on each PC. */
  private run(
    peerId: string,
    peer: Peer,
    operation: () => Promise<void>,
  ): Promise<void> {
    if (peer.queued >= 128) return Promise.resolve();
    peer.queued++;
    const result = peer.operations
      .then(async () => {
        if (this.current(peerId, peer)) await operation();
      })
      .finally(() => {
        peer.queued--;
      });
    peer.operations = result.catch(() => undefined);
    return result;
  }

  private outgoingCount(): number {
    return [...this.peers.values()].filter(
      (peer) =>
        peer.role === 'host' &&
        !peer.failed &&
        peer.connection
          .getSenders()
          .some(
            (sender) =>
              sender.track?.kind === 'video' &&
              sender.track.readyState !== 'ended',
          ),
    ).length;
  }

  private async rebalance(): Promise<void> {
    await Promise.all(
      [...this.peers].map(([id, peer]) => {
        peer.dirty = true;
        return this.run(id, peer, () => this.applyParameters(id, peer));
      }),
    );
  }

  private async applyParameters(peerId: string, peer: Peer): Promise<void> {
    if (
      !this.current(peerId, peer) ||
      peer.failed ||
      peer.role !== 'host' ||
      peer.connection.signalingState !== 'stable' ||
      Date.now() < peer.retryParametersAt
    )
      return;
    const audioSenders = peer.connection
      .getSenders()
      .filter(
        (sender) =>
          sender.track?.kind === 'audio' && sender.track.readyState !== 'ended',
      );
    const fairBitrate = Math.max(
      1,
      (this.preferences.maxUploadMbps * 850_000) /
        Math.max(1, this.outgoingCount()) -
        (audioSenders.length ? AUDIO_UPLOAD_RESERVE : 0),
    );
    const target = peer.controller.target(fairBitrate);
    const senders = peer.connection
      .getSenders()
      .filter(
        (sender) =>
          sender.track?.kind === 'video' && sender.track.readyState !== 'ended',
      );
    const signature = JSON.stringify([
      target,
      senders.map((sender) => sender.track?.getSettings()),
      audioSenders.length,
    ]);
    if (!peer.dirty && signature === peer.appliedTarget) return;
    try {
      let audioParameterError = false;
      for (const sender of audioSenders) {
        try {
          const parameters = sender.getParameters();
          if (!parameters.encodings?.length)
            throw new Error('Áudio ainda não negociado.');
          const active = parameters.encodings.filter(
            (encoding) => encoding.active !== false,
          );
          for (const encoding of active)
            encoding.maxBitrate = Math.floor(
              AUDIO_MAX_BITRATE /
                Math.max(1, active.length) /
                audioSenders.length,
            );
          await sender.setParameters(parameters);
        } catch {
          // Unsupported audio limits must not prevent the video budget being applied.
          audioParameterError = true;
        }
        if (!this.current(peerId, peer)) return;
      }
      for (const sender of senders) {
        if (!this.current(peerId, peer)) return;
        const parameters = sender.getParameters();
        // setParameters must preserve the actual negotiated encoding envelope.
        if (!parameters.encodings?.length)
          throw new Error('Encoder ainda não negociado.');
        const active = parameters.encodings.filter(
          (encoding) => encoding.active !== false,
        );
        if (!active.length) continue;
        const scale = resolutionScale(sender.track!.getSettings(), target);
        parameters.degradationPreference = target.degradationPreference;
        for (const encoding of active) {
          encoding.maxBitrate = Math.max(
            1,
            Math.floor(
              target.bitrate / active.length / Math.max(1, senders.length),
            ),
          );
          encoding.maxFramerate = target.fps;
          if (scale !== undefined) encoding.scaleResolutionDownBy = scale;
        }
        await sender.setParameters(parameters);
        if (!this.current(peerId, peer)) return;
      }
      peer.parameterError = audioParameterError;
      peer.dirty = audioParameterError;
      peer.retryParametersAt = audioParameterError ? Date.now() + 10_000 : 0;
      peer.appliedTarget = signature;
    } catch {
      if (!this.current(peerId, peer)) return;
      peer.parameterError = true;
      peer.dirty = true;
      peer.retryParametersAt = Date.now() + 10_000;
    }
    this.emitMetrics();
  }

  async offer(peerId: string, stream: MediaStream): Promise<void> {
    if (this.disposed) return;
    const peer = this.create(peerId, 'host');
    try {
      await this.run(peerId, peer, async () => {
        for (const track of stream
          .getTracks()
          .filter((track) => track.readyState !== 'ended'))
          peer.connection.addTrack(track, stream);
        if (
          this.preferences.preferredCodec &&
          typeof RTCRtpSender !== 'undefined'
        ) {
          const codecs = RTCRtpSender.getCapabilities('video')?.codecs ?? [];
          const preferred =
            `video/${this.preferences.preferredCodec}`.toLowerCase();
          if (
            codecs.some((codec) => codec.mimeType.toLowerCase() === preferred)
          ) {
            const ordered = [
              ...codecs.filter(
                (codec) => codec.mimeType.toLowerCase() === preferred,
              ),
              ...codecs.filter(
                (codec) => codec.mimeType.toLowerCase() !== preferred,
              ),
            ];
            for (const transceiver of peer.connection.getTransceivers()) {
              if (transceiver.sender.track?.kind === 'video') {
                try {
                  transceiver.setCodecPreferences(ordered);
                } catch {
                  /* Keep browser compatibility if preferences are unsupported. */
                }
              }
            }
          }
        }
        await this.applyParameters(peerId, peer);
        if (!this.current(peerId, peer)) return;
        const offer = await peer.connection.createOffer();
        if (!this.current(peerId, peer)) return;
        await peer.connection.setLocalDescription(offer);
        if (this.current(peerId, peer))
          this.send(peerId, {
            type: 'offer',
            sdp: peer.connection.localDescription?.sdp ?? offer.sdp!,
          });
      });
      await this.rebalance();
    } catch {
      if (this.current(peerId, peer)) this.recover(peerId, peer);
    }
  }

  private async flushIce(peerId: string, peer: Peer): Promise<void> {
    if (!peer.connection.remoteDescription) return;
    const waiting: RTCIceCandidateInit[] = [];
    for (const candidate of peer.incoming.splice(0)) {
      if (!this.current(peerId, peer)) return;
      const fragment = candidateUfrag(candidate);
      if (fragment && peer.retiredUfrags.has(fragment)) continue;
      if (
        fragment &&
        peer.remoteUfrags.size &&
        !peer.remoteUfrags.has(fragment)
      ) {
        waiting.push(candidate);
        continue;
      }
      try {
        await peer.connection.addIceCandidate(candidate);
      } catch {
        /* A late/obsolete candidate must not tear down a healthy stream. */
      }
    }
    if (this.current(peerId, peer)) peer.incoming.push(...waiting.slice(-128));
  }

  /** Stop sending audio without renegotiating or interrupting screen video. */
  async stopAudio(): Promise<void> {
    await Promise.all(
      [...this.peers].map(([id, peer]) =>
        this.run(id, peer, async () => {
          if (peer.role !== 'host') return;
          for (const sender of peer.connection.getSenders())
            if (sender.track?.kind === 'audio') await sender.replaceTrack(null);
          peer.dirty = true;
          peer.retryParametersAt = 0;
          await this.applyParameters(id, peer);
        }),
      ),
    );
  }

  async receive(
    peerId: string,
    signal: SignalPayload,
    allowOffer: boolean,
  ): Promise<void> {
    if (this.disposed) return;
    if (signal.type === 'ice') {
      const peer = this.peers.get(peerId);
      if (!peer) {
        if (!this.waitingIce.has(peerId) && this.waitingIce.size >= 100) return;
        const waiting = this.waitingIce.get(peerId) ?? [];
        if (waiting.length < 128) waiting.push(signal.candidate);
        this.waitingIce.set(peerId, waiting);
      } else {
        if (peer.incoming.length < 128) peer.incoming.push(signal.candidate);
        await this.run(peerId, peer, () => this.flushIce(peerId, peer));
      }
      return;
    }
    if (signal.type === 'offer' && !allowOffer) return;
    let peer = this.peers.get(peerId);
    if (signal.type === 'offer' && !peer) peer = this.create(peerId, 'viewer');
    if (
      !peer ||
      (signal.type === 'offer' && peer.role !== 'viewer') ||
      (signal.type === 'answer' && peer.role !== 'host')
    )
      return;
    const target = peer;
    try {
      await this.run(peerId, target, async () => {
        if (
          signal.type === 'answer' &&
          target.connection.signalingState !== 'have-local-offer'
        )
          return;
        const fragments = ufrags(signal.sdp);
        await target.connection.setRemoteDescription({
          type: signal.type,
          sdp: signal.sdp,
        });
        if (!this.current(peerId, target)) return;
        for (const old of target.remoteUfrags)
          if (!fragments.has(old)) target.retiredUfrags.add(old);
        while (target.retiredUfrags.size > 8)
          target.retiredUfrags.delete(
            target.retiredUfrags.values().next().value!,
          );
        target.remoteUfrags = fragments;
        await this.flushIce(peerId, target);
        if (!this.current(peerId, target)) return;
        if (signal.type === 'offer') {
          const answer = await target.connection.createAnswer();
          if (!this.current(peerId, target)) return;
          await target.connection.setLocalDescription(answer);
          if (this.current(peerId, target))
            this.send(peerId, {
              type: 'answer',
              sdp: target.connection.localDescription?.sdp ?? answer.sdp!,
            });
        }
        if (this.current(peerId, target)) {
          target.dirty = true;
          target.retryParametersAt = 0;
          await this.applyParameters(peerId, target);
        }
      });
    } catch {
      if (this.current(peerId, target)) this.recover(peerId, target);
    }
  }

  private markRecovering(peerId: string, peer: Peer): void {
    if (!this.current(peerId, peer) || peer.failed) return;
    if (!peer.recovering) {
      peer.recovering = true;
      this.notify(peerId, peer, 'reconnecting');
      this.emitMetrics();
    }
  }

  private notify(
    peerId: string,
    peer: Peer,
    state: PeerConnectionStatus,
    details?: {
      connectionState: RTCPeerConnectionState;
      iceConnectionState: RTCIceConnectionState;
      role: Peer['role'];
    },
  ): void {
    if (peer.lastState === state) return;
    peer.lastState = state;
    if (details) this.onState(peerId, state, details);
    else this.onState(peerId, state);
  }

  private fail(peerId: string, peer: Peer): void {
    if (!this.current(peerId, peer) || peer.failed) return;
    const details = {
      connectionState: peer.connection.connectionState,
      iceConnectionState: peer.connection.iceConnectionState,
      role: peer.role,
    };
    this.clearRecoveryTimers(peer);
    peer.recovering = false;
    peer.failed = true;
    this.detach(peer);
    peer.connection.close();
    this.notify(peerId, peer, 'failed', details);
    void this.rebalance();
    this.emitMetrics();
  }

  private recover(peerId: string, peer: Peer): void {
    if (!this.current(peerId, peer) || peer.failed) return;
    this.markRecovering(peerId, peer);
    if (peer.restartTimer || peer.restartInFlight) return;
    clearTimeout(peer.setupTimer);
    if (peer.role === 'viewer') {
      peer.restartTimer = setTimeout(() => {
        peer.restartTimer = undefined;
        this.fail(peerId, peer);
      }, 12_000);
      return;
    }
    if (peer.restartAttempts >= 2) {
      this.fail(peerId, peer);
      return;
    }
    peer.restartTimer = setTimeout(
      () => {
        peer.restartTimer = undefined;
        peer.restartInFlight = true;
        void this.run(peerId, peer, async () => {
          if (!peer.recovering || !this.current(peerId, peer)) return;
          peer.restartAttempts += 1;
          if (peer.connection.signalingState === 'have-local-offer') {
            await peer.connection.setLocalDescription({ type: 'rollback' });
            if (!this.current(peerId, peer) || !peer.recovering) return;
          }
          const offer = await peer.connection.createOffer({ iceRestart: true });
          if (!this.current(peerId, peer) || !peer.recovering) return;
          await peer.connection.setLocalDescription(offer);
          if (!this.current(peerId, peer) || !peer.recovering) return;
          this.send(peerId, {
            type: 'offer',
            sdp: peer.connection.localDescription?.sdp ?? offer.sdp!,
          });
        })
          .catch(() => undefined)
          .finally(() => {
            peer.restartInFlight = false;
            if (this.current(peerId, peer) && peer.recovering && !peer.failed)
              peer.restartTimer = setTimeout(() => {
                peer.restartTimer = undefined;
                this.recover(peerId, peer);
              }, 12_000);
          });
      },
      peer.restartAttempts === 0 ? 1_000 : 3_000,
    );
  }

  private clearRecoveryTimers(peer: Peer): void {
    clearTimeout(peer.setupTimer);
    clearTimeout(peer.disconnectedTimer);
    clearTimeout(peer.restartTimer);
    peer.setupTimer = peer.disconnectedTimer = peer.restartTimer = undefined;
  }

  private schedulePoll(): void {
    if (this.disposed || !this.peers.size || this.pollTimer) return;
    this.pollTimer = setTimeout(() => {
      this.pollTimer = undefined;
      void this.poll();
    }, 2_000);
  }

  private async poll(): Promise<void> {
    if (this.disposed || !this.peers.size) return;
    if (this.pollInFlight) {
      this.schedulePoll();
      return;
    }
    this.pollInFlight = true;
    const epoch = this.epoch;
    try {
      await Promise.all(
        [...this.peers].map(async ([id, peer]) => {
          if (peer.failed) return;
          try {
            const report = await peer.connection.getStats();
            if (!this.current(id, peer) || epoch !== this.epoch) return;
            const direction = peer.role === 'host' ? 'outbound' : 'inbound';
            const sample = peer.telemetry.sample(
              report,
              id,
              direction,
              Date.now(),
            );
            const fair =
              (this.preferences.maxUploadMbps * 850_000) /
              Math.max(1, this.outgoingCount());
            if (
              peer.role === 'host' &&
              !peer.recovering &&
              !peer.failed &&
              peer.connection.connectionState === 'connected' &&
              (sample.fps !== undefined || sample.bitrateMbps !== undefined) &&
              peer.controller.observe(sample, Date.now())
            )
              peer.dirty = true;
            peer.metrics = {
              ...sample,
              peerId: id,
              direction,
              timestamp: Date.now(),
              adaptive: this.preferences.adaptive,
              recovering: peer.recovering,
              parameterError: peer.parameterError,
              levelLabel:
                peer.role === 'host'
                  ? peer.controller.target(fair).label
                  : undefined,
            };
            void this.run(id, peer, () => this.applyParameters(id, peer));
          } catch {
            /* Unavailable stats remain unknown; transport state handles recovery. */
          }
        }),
      );
      if (!this.disposed && epoch === this.epoch) this.emitMetrics();
    } finally {
      this.pollInFlight = false;
      this.schedulePoll();
    }
  }

  private emitMetrics(): void {
    if (this.disposed) return;
    this.options?.onMetrics?.(
      [...this.peers].map(([id, peer]) => ({
        ...(peer.metrics ?? {
          peerId: id,
          direction:
            peer.role === 'host' ? ('outbound' as const) : ('inbound' as const),
          timestamp: Date.now(),
        }),
        adaptive: this.preferences.adaptive,
        recovering: peer.recovering,
        parameterError: peer.parameterError,
      })),
    );
  }

  remove(peerId: string): void {
    const peer = this.peers.get(peerId);
    this.peers.delete(peerId);
    this.waitingIce.delete(peerId);
    if (!peer) return;
    this.clearRecoveryTimers(peer);
    peer.telemetry.reset();
    this.detach(peer);
    peer.connection.close();
    if (!this.peers.size) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }
    void this.rebalance();
    this.emitMetrics();
  }

  private detach(peer: Peer): void {
    peer.connection.ontrack = null;
    peer.connection.onicecandidate = null;
    peer.connection.onconnectionstatechange = null;
    peer.connection.oniceconnectionstatechange = null;
    peer.connection.onsignalingstatechange = null;
  }

  clear(): void {
    this.epoch += 1;
    clearTimeout(this.pollTimer);
    this.pollTimer = undefined;
    for (const peerId of this.peers.keys()) this.remove(peerId);
    this.waitingIce.clear();
  }

  dispose(): void {
    this.disposed = true;
    this.clear();
  }
}
