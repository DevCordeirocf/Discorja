import { describe, expect, it, vi } from 'vitest';
import { PeerTelemetry } from '../src/renderer/media/telemetry';

type Stat = {
  id: string;
  type: string;
  timestamp: number;
  [field: string]: unknown;
};

function report(...stats: Stat[]): RTCStatsReport {
  return new Map(
    stats.map((stat) => [stat.id, stat]),
  ) as unknown as RTCStatsReport;
}

function video(
  direction: 'outbound' | 'inbound',
  fields: Partial<Stat> = {},
): Stat {
  return {
    id: 'video',
    type: `${direction}-rtp`,
    kind: 'video',
    ssrc: 123,
    timestamp: 1_000,
    codecId: 'codec',
    transportId: 'transport',
    ...fields,
  };
}

function network(relay: 'local' | 'remote' | false = false): Stat[] {
  return [
    { id: 'codec', type: 'codec', timestamp: 1_000, mimeType: 'video/VP9' },
    {
      id: 'transport',
      type: 'transport',
      timestamp: 1_000,
      selectedCandidatePairId: 'current-pair',
    },
    {
      id: 'current-pair',
      type: 'candidate-pair',
      timestamp: 1_000,
      transportId: 'transport',
      state: 'succeeded',
      localCandidateId: 'local',
      remoteCandidateId: 'remote',
      currentRoundTripTime: 0.042,
    },
    {
      id: 'local',
      type: 'local-candidate',
      timestamp: 1_000,
      candidateType: relay === 'local' ? 'relay' : 'host',
    },
    {
      id: 'remote',
      type: 'remote-candidate',
      timestamp: 1_000,
      candidateType: relay === 'remote' ? 'relay' : 'srflx',
    },
  ];
}

describe('Telemetria WebRTC por fluxo de vídeo', () => {
  it('mede áudio separado do vídeo e descarta intervalos repetidos ou contadores reiniciados', () => {
    const telemetry = new PeerTelemetry();
    const sample = (
      timestamp: number,
      bytes: number,
      received: number,
      lost: number,
      id = 'sound',
    ) =>
      telemetry.sample(
        report(
          video('inbound', {
            timestamp,
            bytesReceived: bytes * 10,
            framesDecoded: timestamp / 100,
          }),
          {
            id,
            type: 'inbound-rtp',
            kind: 'audio',
            timestamp,
            bytesReceived: bytes,
            packetsReceived: received,
            packetsLost: lost,
            jitter: 0.012,
            codecId: 'opus',
            jitterBufferDelay: 0.8,
            jitterBufferEmittedCount: 20,
            concealedSamples: 960,
          },
          { id: 'opus', type: 'codec', timestamp, mimeType: 'audio/opus' },
        ),
        'peer',
        'inbound',
      );
    expect(sample(1000, 1000, 100, 0).audioBitrateKbps).toBeUndefined();
    const measured = sample(2000, 17000, 198, 2);
    expect(measured).toMatchObject({
      audioCodec: 'audio/opus',
      audioBitrateKbps: 128,
      audioJitterMs: 12,
      audioPacketLossPercent: 2,
      audioConcealedSamples: 960,
      audioBufferMs: 40,
      bitrateMbps: 1.28,
    });
    expect(sample(2000, 17000, 198, 2).audioBitrateKbps).toBeUndefined();
    expect(sample(3000, 10, 1, 0).audioBitrateKbps).toBeUndefined();
    expect(
      sample(4000, 1000, 5, 0, 'replacement').audioBitrateKbps,
    ).toBeUndefined();
    telemetry.reset();
    expect(sample(5000, 2000, 10, 0).audioBitrateKbps).toBeUndefined();
  });
  it('informa encoder e congelamentos somente quando o navegador fornece dados', () => {
    const telemetry = new PeerTelemetry();
    const measured = telemetry.sample(
      report(
        video('inbound', {
          decoderImplementation: 'libvpx',
          powerEfficientDecoder: false,
          jitter: 0.015,
          freezeCount: 2,
          framesDropped: 3,
          totalFreezesDuration: 1.5,
        }),
      ),
      'viewer',
      'inbound',
    );
    expect(measured).toMatchObject({
      decoderImplementation: 'libvpx',
      powerEfficientDecoder: false,
      jitterMs: 15,
      freezeCount: 2,
      framesDropped: 3,
      totalFreezesDuration: 1.5,
    });
    expect(
      telemetry.sample(report(video('outbound')), 'host', 'outbound')
        .powerEfficientEncoder,
    ).toBeUndefined();
  });
  it('mede bitrate e FPS com deltas e relógio do relatório, sem taxa fictícia na primeira leitura', () => {
    const telemetry = new PeerTelemetry();
    const first = telemetry.sample(
      report(video('outbound', { bytesSent: 50_000, framesEncoded: 10 })),
      'viewer',
      'outbound',
      500,
    );
    expect(first).toMatchObject({
      peerId: 'viewer',
      direction: 'outbound',
      timestamp: 500,
    });
    expect(first.bitrateMbps).toBeUndefined();
    expect(first.fps).toBeUndefined();
    const second = telemetry.sample(
      report(
        video('outbound', {
          timestamp: 3_000,
          bytesSent: 1_050_000,
          framesEncoded: 130,
        }),
      ),
      'viewer',
      'outbound',
      501,
    );
    expect(second.bitrateMbps).toBe(4);
    expect(second.fps).toBe(60);
  });

  it('mostra resolução e FPS codificados, codec relacionado e RTT da rota selecionada', () => {
    const telemetry = new PeerTelemetry();
    const measured = telemetry.sample(
      report(
        video('outbound', {
          frameWidth: 1920,
          frameHeight: 1080,
          framesPerSecond: 27.5,
          qualityLimitationReason: 'cpu',
        }),
        ...network(),
        {
          id: 'input',
          type: 'media-source',
          timestamp: 1_000,
          kind: 'video',
          width: 3840,
          height: 2160,
          framesPerSecond: 60,
        },
      ),
      'viewer',
      'outbound',
    );
    expect(measured).toMatchObject({
      width: 1920,
      height: 1080,
      fps: 27.5,
      codec: 'video/VP9',
      limitation: 'cpu',
      route: 'direct',
      rttMs: 42,
    });
    telemetry.sample(
      report(video('outbound', { timestamp: 2_000, framesEncoded: 30 })),
      'viewer',
      'outbound',
    );
    const next = telemetry.sample(
      report(
        video('outbound', {
          timestamp: 3_000,
          framesEncoded: 60,
          framesPerSecond: 23,
        }),
      ),
      'viewer',
      'outbound',
    );
    expect(next.fps).toBe(23);
  });

  it('calcula perda de entrada pelo intervalo de pacotes, sem usar totais da sessão', () => {
    const telemetry = new PeerTelemetry();
    telemetry.sample(
      report(
        video('inbound', {
          bytesReceived: 1_000_000,
          framesDecoded: 100,
          packetsReceived: 990,
          packetsLost: 10,
        }),
      ),
      'host',
      'inbound',
    );
    const next = telemetry.sample(
      report(
        video('inbound', {
          timestamp: 2_000,
          bytesReceived: 1_500_000,
          framesDecoded: 130,
          packetsReceived: 1080,
          packetsLost: 20,
        }),
      ),
      'host',
      'inbound',
    );
    expect(next).toMatchObject({
      bitrateMbps: 4,
      fps: 30,
      packetLossPercent: 10,
    });
  });

  it('usa apenas remoteId/localId do RTP selecionado para RTT e perda de saída', () => {
    const telemetry = new PeerTelemetry();
    const remote = (
      timestamp: number,
      received: number,
      lost: number,
    ): Stat => ({
      id: 'matching',
      type: 'remote-inbound-rtp',
      localId: 'video',
      ssrc: 123,
      timestamp,
      packetsReceived: received,
      packetsLost: lost,
      roundTripTime: 0.085,
      fractionLost: 0.75,
    });
    const unrelated: Stat = {
      id: 'unrelated',
      type: 'remote-inbound-rtp',
      timestamp: 1_000,
      ssrc: 999,
      localId: 'audio',
      fractionLost: 0.99,
      roundTripTime: 7,
    };
    telemetry.sample(
      report(
        video('outbound', { remoteId: 'matching' }),
        unrelated,
        remote(900, 900, 100),
        ...network(),
      ),
      'viewer',
      'outbound',
    );
    const measured = telemetry.sample(
      report(
        video('outbound', { timestamp: 2_000, remoteId: 'matching' }),
        unrelated,
        remote(1_900, 995, 105),
        ...network(),
      ),
      'viewer',
      'outbound',
    );
    expect(measured.packetLossPercent).toBe(5);
    expect(measured.rttMs).toBe(85);
  });

  it('aceita fractionLost real quando o navegador não expõe os contadores remotos', () => {
    const telemetry = new PeerTelemetry();
    const remote: Stat = {
      id: 'feedback',
      type: 'remote-inbound-rtp',
      localId: 'video',
      timestamp: 1_000,
      fractionLost: 0.125,
    };
    const measured = telemetry.sample(
      report(video('outbound'), remote),
      'viewer',
      'outbound',
    );
    expect(measured.packetLossPercent).toBe(12.5);
    const cached = telemetry.sample(
      report(video('outbound', { timestamp: 2_000 }), remote),
      'viewer',
      'outbound',
    );
    expect(cached.packetLossPercent).toBeUndefined();
    expect(
      telemetry.sample(
        report(video('outbound', { timestamp: 3_000 }), {
          ...remote,
          timestamp: 3_000,
          fractionLost: 0,
        }),
        'viewer',
        'outbound',
      ).packetLossPercent,
    ).toBe(0);
  });

  it('não fabrica zero para contadores ausentes nem usa estimativa de bitrate como taxa medida', () => {
    const telemetry = new PeerTelemetry();
    telemetry.sample(
      report(video('inbound', { targetBitrate: 20_000_000, packetsLost: 3 })),
      'host',
      'inbound',
    );
    const measured = telemetry.sample(
      report(
        video('inbound', {
          timestamp: 2_000,
          targetBitrate: 20_000_000,
          packetsLost: 3,
        }),
      ),
      'host',
      'inbound',
    );
    expect(measured.bitrateMbps).toBeUndefined();
    expect(measured.fps).toBeUndefined();
    expect(measured.packetLossPercent).toBeUndefined();
    expect(measured.rttMs).toBeUndefined();
    expect(measured.width).toBeUndefined();
    expect(measured.limitation).toBeUndefined();
  });

  it('preserva zero medido em intervalo válido e omite taxas em relatório repetido', () => {
    const telemetry = new PeerTelemetry();
    const first = video('inbound', {
      bytesReceived: 50,
      framesDecoded: 10,
      packetsReceived: 10,
      packetsLost: 0,
    });
    telemetry.sample(report(first), 'host', 'inbound');
    const cached = telemetry.sample(report(first), 'host', 'inbound');
    expect(cached.bitrateMbps).toBeUndefined();
    expect(cached.fps).toBeUndefined();
    const paused = telemetry.sample(
      report({ ...first, timestamp: 2_000 }),
      'host',
      'inbound',
    );
    expect(paused.bitrateMbps).toBe(0);
    expect(paused.fps).toBe(0);
    expect(paused.packetLossPercent).toBeUndefined();
    const healthy = telemetry.sample(
      report({ ...first, timestamp: 3_000, packetsReceived: 20 }),
      'host',
      'inbound',
    );
    expect(healthy.packetLossPercent).toBe(0);
  });

  it('reinicia a linha de base quando counters, SSRC ou fonte mudam', () => {
    const telemetry = new PeerTelemetry();
    telemetry.sample(
      report(
        video('outbound', {
          bytesSent: 1_000_000,
          framesEncoded: 60,
          mediaSourceId: 'old-source',
        }),
      ),
      'viewer',
      'outbound',
    );
    const reset = telemetry.sample(
      report(
        video('outbound', {
          timestamp: 2_000,
          bytesSent: 100,
          framesEncoded: 0,
          mediaSourceId: 'old-source',
        }),
      ),
      'viewer',
      'outbound',
    );
    expect(reset.bitrateMbps).toBeUndefined();
    expect(reset.fps).toBeUndefined();
    const changedSsrc = telemetry.sample(
      report(
        video('outbound', {
          timestamp: 3_000,
          ssrc: 456,
          bytesSent: 100,
          framesEncoded: 0,
          mediaSourceId: 'old-source',
        }),
      ),
      'viewer',
      'outbound',
    );
    expect(changedSsrc.bitrateMbps).toBeUndefined();
    expect(changedSsrc.fps).toBeUndefined();
    const changedSource = telemetry.sample(
      report(
        video('outbound', {
          timestamp: 4_000,
          ssrc: 456,
          bytesSent: 100,
          framesEncoded: 0,
          mediaSourceId: 'new-source',
        }),
      ),
      'viewer',
      'outbound',
    );
    expect(changedSource.bitrateMbps).toBeUndefined();
    expect(changedSource.fps).toBeUndefined();
    expect(
      telemetry.sample(
        report(
          video('outbound', {
            timestamp: 5_000,
            ssrc: 456,
            bytesSent: 500_100,
            framesEncoded: 30,
            mediaSourceId: 'new-source',
          }),
        ),
        'viewer',
        'outbound',
      ),
    ).toMatchObject({ bitrateMbps: 4, fps: 30 });
  });

  it('não compara fluxos de peers ou direções diferentes e reset remove a linha de base', () => {
    const telemetry = new PeerTelemetry();
    telemetry.sample(
      report(video('outbound', { bytesSent: 1 })),
      'one',
      'outbound',
    );
    expect(
      telemetry.sample(
        report(video('outbound', { timestamp: 2_000, bytesSent: 1_000_001 })),
        'two',
        'outbound',
      ).bitrateMbps,
    ).toBeUndefined();
    expect(
      telemetry.sample(
        report(
          video('inbound', { timestamp: 2_000, bytesReceived: 1_000_001 }),
        ),
        'one',
        'inbound',
      ).bitrateMbps,
    ).toBeUndefined();
    telemetry.reset();
    expect(
      telemetry.sample(
        report(video('outbound', { timestamp: 3_000, bytesSent: 2_000_001 })),
        'one',
        'outbound',
      ).bitrateMbps,
    ).toBeUndefined();
  });

  it('segue apenas o par apontado pelo transporte, incluindo relay local ou remoto', () => {
    const telemetry = new PeerTelemetry();
    const misleading: Stat = {
      id: 'old-pair',
      type: 'candidate-pair',
      timestamp: 1_000,
      selected: true,
      nominated: true,
      state: 'succeeded',
      localCandidateId: 'old-local',
      remoteCandidateId: 'old-remote',
      currentRoundTripTime: 8,
    };
    expect(
      telemetry.sample(
        report(video('inbound'), misleading, ...network('local')),
        'host',
        'inbound',
      ),
    ).toMatchObject({ route: 'relay', rttMs: 42 });
    expect(
      telemetry.sample(
        report(video('inbound'), ...network('remote')),
        'other',
        'inbound',
      ).route,
    ).toBe('relay');
    const noSelected = network().filter((stat) => stat.id !== 'transport');
    expect(
      telemetry.sample(
        report(video('inbound'), misleading, ...noSelected),
        'third',
        'inbound',
      ),
    ).toMatchObject({ route: 'unknown' });
    expect(
      telemetry.sample(
        report(video('inbound'), misleading, ...noSelected),
        'third',
        'inbound',
      ).rttMs,
    ).toBeUndefined();
    const incomplete = network().filter((stat) => stat.id !== 'remote');
    expect(
      telemetry.sample(
        report(video('inbound'), ...incomplete),
        'fourth',
        'inbound',
      ).route,
    ).toBe('unknown');
  });

  it('ignora RTP de áudio, RTX, fluxos desativados e tracks encerradas', () => {
    const telemetry = new PeerTelemetry();
    const measured = telemetry.sample(
      report(
        video('outbound', {
          id: 'old',
          active: false,
          bytesSent: 1_000_000,
          framesPerSecond: 60,
          frameWidth: 3840,
        }),
        video('outbound', { id: 'ended', ended: true, frameWidth: 3840 }),
        video('outbound', {
          id: 'track-ended',
          trackId: 'ended-track',
          frameWidth: 3840,
        }),
        { id: 'ended-track', type: 'track', timestamp: 1_000, ended: true },
        video('outbound', {
          id: 'audio',
          kind: 'audio',
          codecId: 'audio-codec',
          bytesSent: 1_000_000,
        }),
        {
          id: 'audio-codec',
          type: 'codec',
          timestamp: 1_000,
          mimeType: 'audio/opus',
        },
        video('outbound', {
          id: 'repair',
          codecId: 'repair-codec',
          bytesSent: 1_000_000,
        }),
        {
          id: 'repair-codec',
          type: 'codec',
          timestamp: 1_000,
          mimeType: 'video/rtx',
        },
        video('outbound', {
          id: 'current',
          timestamp: 2_000,
          active: true,
          frameWidth: 1280,
          frameHeight: 720,
          framesPerSecond: 29,
        }),
      ),
      'viewer',
      'outbound',
    );
    expect(measured).toMatchObject({ width: 1280, height: 720, fps: 29 });
  });

  it('prefere SSRC com atividade atual ao fluxo antigo com total maior', () => {
    const telemetry = new PeerTelemetry();
    const old = video('inbound', {
      id: 'old',
      ssrc: 1,
      bytesReceived: 100_000_000,
      framesDecoded: 10_000,
      frameWidth: 3840,
      frameHeight: 2160,
    });
    telemetry.sample(report(old), 'host', 'inbound');
    const newStream = video('inbound', {
      id: 'new',
      timestamp: 2_000,
      ssrc: 2,
      bytesReceived: 100_000,
      framesDecoded: 1,
      frameWidth: 1280,
      frameHeight: 720,
    });
    const initialNew = telemetry.sample(
      report({ ...old, timestamp: 2_000 }, newStream),
      'host',
      'inbound',
    );
    expect(initialNew.width).toBe(1280);
    expect(initialNew.bitrateMbps).toBeUndefined();
    const active = telemetry.sample(
      report(
        { ...old, timestamp: 3_000 },
        {
          ...newStream,
          timestamp: 3_000,
          bytesReceived: 600_000,
          framesDecoded: 31,
        },
      ),
      'host',
      'inbound',
    );
    expect(active).toMatchObject({ width: 1280, fps: 30, bitrateMbps: 4 });
  });

  it('elimina a linha de base de RTP ausente e não a reaproveita se reaparecer', () => {
    const telemetry = new PeerTelemetry();
    telemetry.sample(
      report(video('inbound', { bytesReceived: 100, framesDecoded: 1 })),
      'host',
      'inbound',
    );
    const missing = telemetry.sample(report(), 'host', 'inbound');
    expect(missing).toEqual({
      peerId: 'host',
      direction: 'inbound',
      timestamp: expect.any(Number),
      route: 'unknown',
    });
    const resumed = telemetry.sample(
      report(
        video('inbound', {
          timestamp: 3_000,
          bytesReceived: 100,
          framesDecoded: 1,
        }),
      ),
      'host',
      'inbound',
    );
    expect(resumed.bitrateMbps).toBeUndefined();
    expect(resumed.fps).toBeUndefined();
  });

  it('ignora relatórios fora de ordem e não desloca a linha de base para trás', () => {
    const telemetry = new PeerTelemetry();
    telemetry.sample(
      report(
        video('outbound', {
          timestamp: 2_000,
          bytesSent: 500_000,
          framesEncoded: 30,
        }),
      ),
      'viewer',
      'outbound',
    );
    const late = telemetry.sample(
      report(
        video('outbound', {
          timestamp: 1_000,
          bytesSent: 0,
          framesEncoded: 0,
          framesPerSecond: 0,
        }),
      ),
      'viewer',
      'outbound',
    );
    expect(late.bitrateMbps).toBeUndefined();
    expect(late.fps).toBeUndefined();
    const current = telemetry.sample(
      report(
        video('outbound', {
          timestamp: 3_000,
          bytesSent: 1_000_000,
          framesEncoded: 60,
        }),
      ),
      'viewer',
      'outbound',
    );
    expect(current).toMatchObject({ bitrateMbps: 4, fps: 30 });
  });

  it('omite perda quando contadores remotos recuam e não relata zero de recuperação de pacotes', () => {
    const telemetry = new PeerTelemetry();
    const remote: Stat = {
      id: 'feedback',
      type: 'remote-inbound-rtp',
      timestamp: 1_000,
      localId: 'video',
      packetsReceived: 1000,
      packetsLost: 100,
      fractionLost: 0,
    };
    telemetry.sample(
      report(video('outbound', { remoteId: 'feedback' }), remote),
      'viewer',
      'outbound',
    );
    expect(
      telemetry.sample(
        report(video('outbound', { timestamp: 2_000, remoteId: 'feedback' }), {
          ...remote,
          timestamp: 2_000,
          packetsReceived: 10,
          packetsLost: 0,
        }),
        'viewer',
        'outbound',
      ).packetLossPercent,
    ).toBeUndefined();
    const inbound = new PeerTelemetry();
    inbound.sample(
      report(video('inbound', { packetsReceived: 100, packetsLost: 10 })),
      'host',
      'inbound',
    );
    expect(
      inbound.sample(
        report(
          video('inbound', {
            timestamp: 2_000,
            packetsReceived: 200,
            packetsLost: 8,
          }),
        ),
        'host',
        'inbound',
      ).packetLossPercent,
    ).toBeUndefined();
  });

  it('descarta números inválidos, motivos desconhecidos e referência remota incompatível', () => {
    const telemetry = new PeerTelemetry();
    const measured = telemetry.sample(
      report(
        video('outbound', {
          frameWidth: 0,
          frameHeight: Number.NaN,
          framesPerSecond: Number.POSITIVE_INFINITY,
          bytesSent: -1,
          qualityLimitationReason: 'gpu',
          remoteId: 'wrong',
        }),
        {
          id: 'wrong',
          type: 'remote-inbound-rtp',
          timestamp: 1_000,
          ssrc: 999,
          localId: 'other-video',
          fractionLost: 1,
          roundTripTime: 9,
        },
        ...network(),
      ),
      'viewer',
      'outbound',
    );
    expect(measured.rttMs).toBe(42);
    expect(measured.packetLossPercent).toBeUndefined();
    expect(measured.width).toBeUndefined();
    expect(measured.height).toBeUndefined();
    expect(measured.fps).toBeUndefined();
    expect(measured.bitrateMbps).toBeUndefined();
    expect(measured.limitation).toBeUndefined();
  });

  it('usa Date.now para validade da amostra da interface', () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(123_456);
    try {
      expect(
        new PeerTelemetry().sample(
          report(video('inbound', { timestamp: 9 })),
          'host',
          'inbound',
        ).timestamp,
      ).toBe(123_456);
    } finally {
      now.mockRestore();
    }
  });

  it('limita linhas de base antigas e mantém as conexões amostradas recentemente', () => {
    const telemetry = new PeerTelemetry();
    for (let index = 0; index < 300; index++) {
      telemetry.sample(
        report(video('outbound', { bytesSent: 1_000 })),
        `viewer-${index}`,
        'outbound',
      );
    }
    expect(
      telemetry.sample(
        report(video('outbound', { timestamp: 2_000, bytesSent: 501_000 })),
        'viewer-299',
        'outbound',
      ).bitrateMbps,
    ).toBe(4);
    expect(
      telemetry.sample(
        report(video('outbound', { timestamp: 2_000, bytesSent: 501_000 })),
        'viewer-0',
        'outbound',
      ).bitrateMbps,
    ).toBeUndefined();
  });
});
