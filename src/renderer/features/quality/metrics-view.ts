import type { PeerMetrics } from '../../../shared/quality';

interface MetricsRoom {
  role: 'host' | 'viewer';
}
interface MetricsViewState {
  room: MetricsRoom | null;
  multiRoom: boolean;
  sharing: boolean;
  remoteSharing: boolean;
  latestMetrics: PeerMetrics[];
  incomingMetrics: PeerMetrics[];
  localStream: MediaStream | null;
  viewers: Map<
    string,
    { name: string; connected: boolean; failed: boolean; reconnecting: boolean }
  >;
  connectionReconnecting: boolean;
  connectionIssue: string;
  metricsStartedAt: number;
  incomingMetricsStartedAt: number;
}

function finiteMetric(value: number | undefined): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
function measured(value: number, decimals = 1): string {
  return value.toLocaleString('pt-BR', {
    maximumFractionDigits: decimals,
    minimumFractionDigits: decimals,
  });
}

export function patchMetrics(root: HTMLElement, state: MetricsViewState): void {
  const {
    room,
    sharing,
    remoteSharing,
    latestMetrics,
    incomingMetrics,
    localStream,
    viewers,
    connectionReconnecting,
    connectionIssue,
    metricsStartedAt,
    incomingMetricsStartedAt,
    multiRoom,
  } = state;
  if (!room) return;
  const now = Date.now();
  const live = multiRoom
    ? sharing || remoteSharing
    : room.role === 'host'
      ? sharing
      : remoteSharing;
  const fresh = [...latestMetrics, ...incomingMetrics].filter(
    (metric) => now - metric.timestamp >= 0 && now - metric.timestamp <= 8_000,
  );
  const captureNode = root.querySelector<HTMLElement>('[data-stat="capture"]');
  if (captureNode) {
    const settings = localStream?.getVideoTracks()[0]?.getSettings();
    captureNode.textContent =
      settings?.width && settings.height
        ? `${settings.width} × ${settings.height}${finiteMetric(settings.frameRate) ? ` · até ${measured(settings.frameRate, 0)} FPS` : ''}`
        : 'Sem captura ativa';
  }
  const outbound = fresh.filter(
    (metric) =>
      metric.direction === 'outbound' &&
      viewers.has(metric.peerId) &&
      finiteMetric(metric.bitrateMbps),
  );
  const total = root.querySelector<HTMLElement>('[data-stat="upload-total"]');
  if (total)
    total.textContent =
      sharing && outbound.length
        ? `${measured(outbound.reduce((sum, metric) => sum + metric.bitrateMbps!, 0))} Mbps`
        : '— Mbps';
  const totalDetail = root.querySelector<HTMLElement>(
    '[data-stat="upload-detail"]',
  );
  if (totalDetail)
    totalDetail.textContent = !sharing
      ? 'Inicie o compartilhamento para medir.'
      : !viewers.size
        ? 'Nenhum espectador conectado.'
        : outbound.length < viewers.size
          ? `Medição parcial · ${outbound.length} de ${viewers.size} conexões.`
          : `Vídeo enviado a ${outbound.length} ${outbound.length === 1 ? 'espectador' : 'espectadores'}.`;
  for (const row of root.querySelectorAll<HTMLElement>('[data-peer-metrics]')) {
    const peerId = row.dataset.peerMetrics;
    const direction =
      row.dataset.direction ?? (room.role === 'host' ? 'outbound' : 'inbound');
    const rowLive = multiRoom
      ? direction === 'outbound'
        ? sharing
        : remoteSharing
      : live;
    const metric = rowLive
      ? fresh.find(
          (entry) => entry.peerId === peerId && entry.direction === direction,
        )
      : undefined;
    const write = (key: string, text: string): void => {
      const node = row.querySelector<HTMLElement>(`[data-value="${key}"]`);
      if (node && node.textContent !== text) node.textContent = text;
    };
    const viewer =
      peerId && direction === 'outbound' ? viewers.get(peerId) : undefined;
    const reconnecting =
      metric?.recovering ||
      viewer?.reconnecting ||
      (direction === 'inbound' && connectionReconnecting);
    write(
      'status',
      reconnecting
        ? 'Reconectando…'
        : !rowLive
          ? 'Sem transmissão'
          : viewer?.failed || (direction === 'inbound' && connectionIssue)
            ? 'Conexão interrompida'
            : metric
              ? 'Medição recebida'
              : (direction === 'inbound' && multiRoom
                    ? incomingMetricsStartedAt
                    : metricsStartedAt) &&
                  now -
                    (direction === 'inbound' && multiRoom
                      ? incomingMetricsStartedAt
                      : metricsStartedAt) >
                    10_000
                ? 'Medição indisponível'
                : 'Aguardando medição',
    );
    write(
      'resolution',
      metric?.width && metric.height
        ? `${metric.width} × ${metric.height}`
        : '—',
    );
    write('fps', finiteMetric(metric?.fps) ? measured(metric.fps, 0) : '—');
    write(
      'bitrate',
      finiteMetric(metric?.bitrateMbps)
        ? `${measured(metric.bitrateMbps)} Mbps`
        : '— Mbps',
    );
    write(
      'rtt',
      finiteMetric(metric?.rttMs) ? `${measured(metric.rttMs, 0)} ms` : '— ms',
    );
    write(
      'loss',
      finiteMetric(metric?.packetLossPercent)
        ? `${measured(metric.packetLossPercent)}%`
        : '—',
    );
    write(
      'route',
      metric?.route === 'direct'
        ? 'Direta'
        : metric?.route === 'relay'
          ? 'Retransmitida'
          : metric
            ? 'Não identificada'
            : '—',
    );
    const detail: string[] = [];
    if (metric && metric.route !== 'direct' && metric.route !== 'relay')
      detail.push(
        'O navegador não informou os candidatos ICE selecionados; a rota da conexão não pôde ser identificada.',
      );
    if (metric?.parameterError)
      detail.push(
        'O navegador não confirmou um limite de envio; confira as medições.',
      );
    if (metric?.levelLabel) detail.push(metric.levelLabel);
    if (metric?.limitation === 'cpu')
      detail.push('O computador está limitando o vídeo.');
    if (metric?.limitation === 'bandwidth')
      detail.push('A conexão está limitando o vídeo.');
    if (metric?.limitation === 'other')
      detail.push('O navegador está limitando o vídeo.');
    if (metric?.codec) detail.push(`Formato ${metric.codec}.`);
    if (metric?.audioCodec)
      detail.push(
        `Som: ${metric.audioCodec}${finiteMetric(metric.audioBitrateKbps) ? ` · ${measured(metric.audioBitrateKbps, 0)} kbps` : ''}.`,
      );
    if (finiteMetric(metric?.audioJitterMs))
      detail.push(`Variação do som: ${measured(metric.audioJitterMs)} ms.`);
    if (finiteMetric(metric?.audioPacketLossPercent))
      detail.push(
        `Perda de áudio: ${measured(metric.audioPacketLossPercent)}%.`,
      );
    if (finiteMetric(metric?.audioBufferMs))
      detail.push(
        `Buffer de áudio médio: ${measured(metric.audioBufferMs)} ms.`,
      );
    if (metric?.encoderImplementation)
      detail.push(`Codificador ${metric.encoderImplementation}.`);
    if (metric?.decoderImplementation)
      detail.push(`Decodificador ${metric.decoderImplementation}.`);
    if (metric?.direction === 'outbound')
      detail.push(
        metric.powerEfficientEncoder === undefined
          ? 'Aceleração: não informada.'
          : metric.powerEfficientEncoder
            ? 'Codificador eficiente informado pelo navegador.'
            : 'Codificador eficiente não informado como ativo.',
      );
    if (finiteMetric(metric?.jitterMs))
      detail.push(`Jitter ${measured(metric.jitterMs)} ms.`);
    if (finiteMetric(metric?.framesDropped))
      detail.push(`Quadros descartados: ${metric.framesDropped}.`);
    if (finiteMetric(metric?.freezeCount))
      detail.push(`Congelamentos: ${metric.freezeCount}.`);
    write(
      'detail',
      detail.join(' ') ||
        (metric
          ? 'A qualidade pode variar com a tela, o computador e a conexão.'
          : live
            ? 'Aguardando dados disponíveis desta conexão.'
            : 'As medições aparecem durante o compartilhamento.'),
    );
  }
}
