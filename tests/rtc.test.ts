import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RoomPeers } from '../src/renderer/rtc';
import {
  DEFAULT_STREAM_PREFERENCES,
  type PeerMetrics,
} from '../src/shared/quality';

class FakeSender {
  parameters = {
    transactionId: 'initial',
    encodings: [{ active: true }],
  } as RTCRtpSendParameters;
  inFlight = 0;
  maxInFlight = 0;
  hook?: () => Promise<void>;
  constructor(readonly track: MediaStreamTrack) {}
  getParameters = vi.fn(() => structuredClone(this.parameters));
  setParameters = vi.fn(async (parameters: RTCRtpSendParameters) => {
    this.maxInFlight = Math.max(this.maxInFlight, ++this.inFlight);
    try {
      await this.hook?.();
      this.parameters = structuredClone(parameters);
    } finally {
      this.inFlight -= 1;
    }
  });
  replaceTrack = vi.fn(async (track: MediaStreamTrack | null) => {
    (this as { track: MediaStreamTrack | null }).track = track;
  });
}

class FakePC {
  static instances: FakePC[] = [];
  signalingState: RTCSignalingState = 'stable';
  connectionState: RTCPeerConnectionState = 'new';
  iceConnectionState: RTCIceConnectionState = 'new';
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  senders: FakeSender[] = [];
  closed = false;
  onicecandidate: (() => void) | null = null;
  ontrack: ((event: RTCTrackEvent) => void) | null = null;
  onconnectionstatechange: (() => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  onsignalingstatechange: (() => void) | null = null;
  constructor() {
    FakePC.instances.push(this);
  }
  addTrack(track: MediaStreamTrack) {
    const sender = new FakeSender(track);
    this.senders.push(sender);
    return sender;
  }
  getSenders() {
    return this.senders;
  }
  createOffer = vi.fn(
    async (_options?: RTCOfferOptions): Promise<RTCSessionDescriptionInit> => ({
      type: 'offer',
      sdp: `v=0\r\na=ice-ufrag:local${this.createOffer.mock.calls.length}\r\n`,
    }),
  );
  createAnswer = vi.fn(async (): Promise<RTCSessionDescriptionInit> => ({
    type: 'answer',
    sdp: 'v=0\r\na=ice-ufrag:viewer\r\n',
  }));
  setLocalDescription = vi.fn(
    async (description: RTCSessionDescriptionInit) => {
      this.localDescription = description;
      this.signalingState =
        description.type === 'offer' ? 'have-local-offer' : 'stable';
      this.onsignalingstatechange?.();
    },
  );
  setRemoteDescription = vi.fn(
    async (description: RTCSessionDescriptionInit) => {
      this.remoteDescription = description;
      this.signalingState =
        description.type === 'offer' ? 'have-remote-offer' : 'stable';
      this.onsignalingstatechange?.();
    },
  );
  addIceCandidate = vi.fn(async (_candidate: RTCIceCandidateInit) => undefined);
  getStats = vi.fn(
    async (): Promise<RTCStatsReport> => new Map() as RTCStatsReport,
  );
  close() {
    this.closed = true;
    this.connectionState = 'closed';
  }
  state(state: RTCPeerConnectionState) {
    this.connectionState = state;
    this.iceConnectionState =
      state === 'connected'
        ? 'connected'
        : state === 'disconnected'
          ? 'disconnected'
          : state === 'failed'
            ? 'failed'
            : 'new';
    this.onconnectionstatechange?.();
  }
}

const stream = (width = 1920, height = 1080) => {
  const tracks = [
    {
      kind: 'video',
      readyState: 'live',
      getSettings: () => ({ width, height }),
    },
  ];
  return {
    getVideoTracks: () => tracks,
    getTracks: () => tracks,
  } as unknown as MediaStream;
};
const instances: RoomPeers[] = [];
function manager(
  preferences = { ...DEFAULT_STREAM_PREFERENCES },
  metrics = vi.fn<(metrics: PeerMetrics[]) => void>(),
) {
  const send = vi.fn();
  const state = vi.fn();
  const received = vi.fn();
  const peers = new RoomPeers([], send, received, state, {
    preferences,
    onMetrics: metrics,
  });
  instances.push(peers);
  return { peers, send, state, metrics, received };
}
async function connected(peers: RoomPeers, id: string) {
  await peers.offer(id, stream());
  await peers.receive(
    id,
    { type: 'answer', sdp: 'v=0\r\na=ice-ufrag:remote\r\n' },
    false,
  );
  const pc = FakePC.instances.at(-1)!;
  pc.state('connected');
  return pc;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('RTCPeerConnection', FakePC);
  FakePC.instances = [];
});
afterEach(() => {
  for (const peer of instances.splice(0)) peer.dispose();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('controle RTC e recuperação', () => {
  it('mantém áudio e vídeo sem stream ID no mesmo MediaStream sem duplicar tracks', async () => {
    class IncomingStream {
      tracks: MediaStreamTrack[] = [];
      getTracks() {
        return this.tracks;
      }
      addTrack(track: MediaStreamTrack) {
        this.tracks.push(track);
      }
    }
    vi.stubGlobal('MediaStream', IncomingStream);
    const { peers, received } = manager();
    await peers.receive('host', { type: 'offer', sdp: 'v=0' }, true);
    const pc = FakePC.instances[0];
    const audio = { kind: 'audio' } as MediaStreamTrack;
    const video = { kind: 'video' } as MediaStreamTrack;
    for (const track of [audio, video, audio])
      pc.ontrack?.({ track, streams: [] } as unknown as RTCTrackEvent);
    const media = received.mock.calls[0][0] as IncomingStream;
    expect(received.mock.calls.every(([value]) => value === media)).toBe(true);
    expect(media.getTracks()).toEqual([audio, video]);
  });
  it('envia áudio e vídeo juntos, reserva banda e encerra só o som sem renegociar', async () => {
    const { peers } = manager({
      ...DEFAULT_STREAM_PREFERENCES,
      maxUploadMbps: 4,
    });
    const videoStream = stream();
    const video = videoStream.getVideoTracks()[0];
    const audio = { kind: 'audio', readyState: 'live' } as MediaStreamTrack;
    const media = { getTracks: () => [video, audio] } as unknown as MediaStream;
    await peers.offer('viewer', media);
    await peers.receive('viewer', { type: 'answer', sdp: 'v=0' }, false);
    const pc = FakePC.instances[0];
    expect(pc.senders.map((sender) => sender.track.kind)).toEqual([
      'video',
      'audio',
    ]);
    expect(pc.senders[0].parameters.encodings[0].maxBitrate).toBe(3_240_000);
    expect(pc.senders[1].parameters.encodings[0].maxBitrate).toBe(128_000);
    expect(pc.senders[1].parameters.encodings[0].maxFramerate).toBeUndefined();
    pc.senders[1].setParameters.mockRejectedValueOnce(
      new Error('unsupported audio limits'),
    );
    await peers.configure({ ...DEFAULT_STREAM_PREFERENCES, maxUploadMbps: 6 });
    expect(pc.senders[0].parameters.encodings[0].maxBitrate).toBe(4_000_000);
    await peers.configure({ ...DEFAULT_STREAM_PREFERENCES, maxUploadMbps: 4 });
    await peers.stopAudio();
    expect(pc.senders[1].replaceTrack).toHaveBeenCalledWith(null);
    expect(pc.senders[0].track).toBe(video);
    expect(pc.senders[0].parameters.encodings[0].maxBitrate).toBe(3_400_000);
    expect(pc.createOffer).toHaveBeenCalledTimes(1);
  });
  it('não republica a captura de som encerrada para um espectador novo', async () => {
    const { peers } = manager();
    const tracks = [
      ...stream().getTracks(),
      { kind: 'audio', readyState: 'ended' } as MediaStreamTrack,
    ];
    await peers.offer('late-viewer', {
      getTracks: () => tracks,
    } as MediaStream);
    expect(
      FakePC.instances[0].senders.map((sender) => sender.track.kind),
    ).toEqual(['video']);
  });
  it('não acumula amostras ruins a partir do mesmo relatório de stats em cache', async () => {
    const preferences = {
      ...DEFAULT_STREAM_PREFERENCES,
      preset: '1080p60' as const,
    };
    const { peers } = manager(preferences);
    const pc = await connected(peers, 'viewer');
    pc.getStats.mockResolvedValue(
      new Map([
        [
          'out',
          {
            id: 'out',
            type: 'outbound-rtp',
            kind: 'video',
            timestamp: 1000,
            bytesSent: 1000,
            framesEncoded: 10,
            framesPerSecond: 60,
            qualityLimitationReason: 'cpu',
          },
        ],
      ]) as unknown as RTCStatsReport,
    );
    await vi.advanceTimersByTimeAsync(60_000);
    expect(pc.senders[0].parameters.encodings[0].maxFramerate).toBe(60);
    expect(pc.senders[0].parameters.encodings[0].maxBitrate).toBe(12_000_000);
  });
  it('libera o encoder e devolve o orçamento de uma conexão definitivamente perdida', async () => {
    const preferences = {
      ...DEFAULT_STREAM_PREFERENCES,
      preset: '1080p60' as const,
      maxUploadMbps: 4,
    };
    const { peers } = manager(preferences);
    const healthy = await connected(peers, 'healthy');
    const lost = await connected(peers, 'lost');
    await peers.configure(preferences);
    expect(healthy.senders[0].parameters.encodings[0].maxBitrate).toBe(
      1_700_000,
    );
    lost.state('failed');
    await vi.advanceTimersByTimeAsync(28_000);
    expect(lost.closed).toBe(true);
    expect(healthy.closed).toBe(false);
    expect(healthy.senders[0].track.readyState).toBe('live');
    expect(healthy.senders[0].parameters.encodings[0].maxBitrate).toBe(
      3_400_000,
    );
  });
  it('muda parâmetros ao vivo sem substituir PC, track ou envelope negociado', async () => {
    const { peers } = manager();
    const pc = await connected(peers, 'viewer');
    const sender = pc.senders[0];
    const track = sender.track;
    await peers.configure({
      preset: '1080p60',
      content: 'motion',
      adaptive: false,
      maxUploadMbps: 40,
    });
    expect(sender.parameters).toMatchObject({
      degradationPreference: 'maintain-framerate',
      encodings: [
        {
          active: true,
          maxBitrate: 12_000_000,
          maxFramerate: 60,
          scaleResolutionDownBy: 1,
        },
      ],
    });
    await peers.configure({
      preset: '720p30',
      content: 'detail',
      adaptive: true,
      maxUploadMbps: 40,
    });
    expect(sender.parameters).toMatchObject({
      degradationPreference: 'maintain-resolution',
      encodings: [
        { maxBitrate: 4_000_000, maxFramerate: 30, scaleResolutionDownBy: 1.5 },
      ],
    });
    await peers.configure({
      preset: '1080p120',
      content: 'detail',
      adaptive: true,
      maxUploadMbps: 100,
    });
    expect(sender.parameters).toMatchObject({
      degradationPreference: 'maintain-framerate',
      encodings: [{ maxBitrate: 30_000_000, maxFramerate: 120 }],
    });
    expect(sender.track).toBe(track);
    expect(FakePC.instances).toHaveLength(1);
    expect(pc.createOffer).toHaveBeenCalledTimes(1);
  });

  it('divide o orçamento total entre espectadores e redistribui ao remover um', async () => {
    const { peers } = manager({
      ...DEFAULT_STREAM_PREFERENCES,
      preset: '1080p60',
      maxUploadMbps: 4,
    });
    const one = await connected(peers, 'one');
    const two = await connected(peers, 'two');
    await peers.configure({
      ...DEFAULT_STREAM_PREFERENCES,
      preset: '1080p60',
      maxUploadMbps: 4,
    });
    expect(one.senders[0].parameters.encodings[0].maxBitrate).toBe(1_700_000);
    expect(two.senders[0].parameters.encodings[0].maxBitrate).toBe(1_700_000);
    peers.remove('two');
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(one.senders[0].parameters.encodings[0].maxBitrate).toBe(3_400_000);
  });

  it('serializa setParameters e a última configuração vence uma transação pendente', async () => {
    const { peers } = manager();
    const pc = await connected(peers, 'viewer');
    let release!: () => void;
    let entered!: () => void;
    const transactionEntered = new Promise<void>((resolve) => {
      entered = resolve;
    });
    pc.senders[0].hook = () =>
      new Promise<void>((resolve) => {
        release = resolve;
        entered();
      });
    const first = peers.configure({
      ...DEFAULT_STREAM_PREFERENCES,
      preset: '1080p60',
    });
    await transactionEntered;
    const second = peers.configure({
      ...DEFAULT_STREAM_PREFERENCES,
      preset: '720p30',
      maxUploadMbps: 4,
    });
    pc.senders[0].hook = undefined;
    release();
    await Promise.all([first, second]);
    expect(pc.senders[0].maxInFlight).toBe(1);
    expect(pc.senders[0].parameters.encodings[0].maxBitrate).toBe(3_400_000);
    expect(pc.senders[0].parameters.encodings[0].maxFramerate).toBe(30);
  });

  it('mantém falha de parâmetros nãofatal, informa erro e retenta quando estável', async () => {
    const { peers, metrics, state } = manager();
    const pc = await connected(peers, 'viewer');
    pc.senders[0].setParameters.mockRejectedValueOnce(new Error('unsupported'));
    await peers.configure({ ...DEFAULT_STREAM_PREFERENCES, preset: '1080p60' });
    expect(metrics.mock.lastCall?.[0][0].parameterError).toBe(true);
    expect(state).not.toHaveBeenCalledWith('viewer', 'failed');
    pc.onsignalingstatechange?.();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(metrics.mock.lastCall?.[0][0].parameterError).toBe(false);
    expect(pc.senders[0].parameters.encodings[0].maxBitrate).toBe(12_000_000);
  });

  it('não inventa encodings quando o navegador ainda não negociou', async () => {
    const { peers, metrics } = manager();
    const pc = await connected(peers, 'viewer');
    pc.senders[0].parameters.encodings = [];
    pc.senders[0].setParameters.mockClear();
    await peers.configure({ ...DEFAULT_STREAM_PREFERENCES, preset: '1080p60' });
    expect(pc.senders[0].setParameters).not.toHaveBeenCalled();
    expect(metrics.mock.lastCall?.[0][0].parameterError).toBe(true);
  });

  it('reutiliza PC no viewer e filtra candidatos de gerações ICE antigas', async () => {
    const { peers, send } = manager();
    await peers.receive(
      'host',
      {
        type: 'ice',
        candidate: { candidate: 'candidate:future', usernameFragment: 'first' },
      },
      true,
    );
    await peers.receive(
      'host',
      { type: 'offer', sdp: 'v=0\r\na=ice-ufrag:first\r\n' },
      true,
    );
    const pc = FakePC.instances[0];
    expect(pc.addIceCandidate).toHaveBeenCalledWith({
      candidate: 'candidate:future',
      usernameFragment: 'first',
    });
    await peers.receive(
      'host',
      {
        type: 'ice',
        candidate: { candidate: 'candidate:next', usernameFragment: 'second' },
      },
      true,
    );
    await peers.receive(
      'host',
      { type: 'offer', sdp: 'v=0\r\na=ice-ufrag:second\r\n' },
      true,
    );
    await peers.receive(
      'host',
      {
        type: 'ice',
        candidate: {
          candidate: 'candidate:obsolete',
          usernameFragment: 'first',
        },
      },
      true,
    );
    expect(FakePC.instances).toHaveLength(1);
    expect(pc.addIceCandidate).toHaveBeenCalledTimes(2);
    expect(pc.createAnswer).toHaveBeenCalledTimes(2);
    expect(
      send.mock.calls.filter(([, signal]) => signal.type === 'answer'),
    ).toHaveLength(2);
  });

  it('reinicia ICE até duas vezes com backoff e preserva PC durante recuperação', async () => {
    const { peers, state } = manager();
    const pc = await connected(peers, 'viewer');
    pc.state('failed');
    expect(state).toHaveBeenLastCalledWith('viewer', 'reconnecting');
    await vi.advanceTimersByTimeAsync(1000);
    expect(pc.createOffer).toHaveBeenLastCalledWith({ iceRestart: true });
    await vi.advanceTimersByTimeAsync(12000 + 3000);
    expect(
      pc.createOffer.mock.calls.filter(([options]) => options?.iceRestart),
    ).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(12000);
    expect(state).toHaveBeenLastCalledWith('viewer', 'failed', {
      connectionState: 'failed',
      iceConnectionState: 'failed',
      role: 'host',
    });
    await vi.advanceTimersByTimeAsync(60000);
    expect(
      pc.createOffer.mock.calls.filter(([options]) => options?.iceRestart),
    ).toHaveLength(2);
    expect(FakePC.instances).toHaveLength(1);
  });

  it('encerra a espera de uma recepção WebRTC falha em 12 segundos', async () => {
    const { peers, state } = manager();
    await peers.receive(
      'host',
      { type: 'offer', sdp: 'v=0\r\na=ice-ufrag:remote\r\n' },
      true,
    );
    const pc = FakePC.instances[0];
    pc.state('connected');
    pc.state('failed');

    await vi.advanceTimersByTimeAsync(11_999);
    expect(state).not.toHaveBeenCalledWith('host', 'failed');
    await vi.advanceTimersByTimeAsync(1);
    expect(state).toHaveBeenLastCalledWith('host', 'failed', {
      connectionState: 'failed',
      iceConnectionState: 'failed',
      role: 'viewer',
    });
  });

  it('cancela recuperação transitória ao reconectar antes do timeout', async () => {
    const { peers, state } = manager();
    const pc = await connected(peers, 'viewer');
    pc.state('disconnected');
    await vi.advanceTimersByTimeAsync(4000);
    pc.state('connected');
    await vi.advanceTimersByTimeAsync(20000);
    expect(pc.createOffer).toHaveBeenCalledTimes(1);
    expect(state).toHaveBeenLastCalledWith('viewer', 'connected');
  });

  it('não sobrepõe rodadas de stats e ignora resultados após clear/dispose', async () => {
    const { peers, metrics } = manager();
    const pc = await connected(peers, 'viewer');
    let resolve!: (value: RTCStatsReport) => void;
    pc.getStats.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    await vi.advanceTimersByTimeAsync(10000);
    expect(pc.getStats).toHaveBeenCalledTimes(1);
    peers.clear();
    metrics.mockClear();
    resolve(new Map() as RTCStatsReport);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    expect(metrics).not.toHaveBeenCalled();
    expect(pc.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(60000);
    expect(pc.getStats).toHaveBeenCalledTimes(1);
  });

  it('não envia ofertas nem publica métricas de operações completadas após dispose', async () => {
    const { peers, send, metrics } = manager();
    let resolve!: (value: RTCSessionDescriptionInit) => void;
    let entered!: () => void;
    const offerEntered = new Promise<void>((done) => {
      entered = done;
    });
    // createOffer is an instance field: substitute it as soon as the synchronous peer is created.
    const pending = peers.offer('viewer', stream());
    const pc = FakePC.instances[0];
    pc.createOffer = vi.fn(
      () =>
        new Promise((done) => {
          resolve = done;
          entered();
        }),
    );
    await offerEntered;
    peers.dispose();
    send.mockClear();
    metrics.mockClear();
    resolve({ type: 'offer', sdp: 'v=0' });
    await pending;
    expect(send).not.toHaveBeenCalled();
    expect(metrics).not.toHaveBeenCalled();
    expect(pc.closed).toBe(true);
  });
});
