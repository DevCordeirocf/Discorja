import type { MultiRoomState } from '../../shared/protocol';
import { escapeHtml as escape } from '../ui/components/html';

export interface DiagnosticsView {
  room: { role: 'host' | 'viewer'; hostId?: string; hostName: string };
  multi: MultiRoomState | null;
  viewers: Array<{ id: string; name: string }>;
  watchingPublisherId?: string;
}

function metricPeer(
  peerId: string,
  name: string,
  direction?: 'inbound' | 'outbound',
): string {
  return `<article class="metric-peer" data-peer-metrics="${escape(peerId)}" ${direction ? `data-direction="${direction}"` : ''}><header><strong>${escape(name)}</strong><span data-value="status">Aguardando medição</span></header><dl class="metric-values"><div><dt>Resolução</dt><dd data-value="resolution">—</dd></div><div><dt>Quadros/s</dt><dd data-value="fps">—</dd></div><div><dt>Vídeo</dt><dd data-value="bitrate">— Mbps</dd></div><div><dt>Resposta</dt><dd data-value="rtt">— ms</dd></div><div><dt>Perda</dt><dd data-value="loss">—</dd></div><div><dt>Conexão</dt><dd data-value="route">—</dd></div></dl><p class="metric-detail" data-value="detail">Os dados aparecem quando a conexão de vídeo é estabelecida.</p></article>`;
}

export function renderDiagnostics(view: DiagnosticsView): string {
  if (view.multi) {
    const rows = view.viewers
      .map((person) =>
        metricPeer(person.id, `Enviando para ${person.name}`, 'outbound'),
      )
      .join('');
    const selected = view.multi.participants.find(
      (person) => person.peerId === view.watchingPublisherId,
    );
    return `<section class="stream-diagnostics" aria-label="Diagnóstico de envio e recepção"><div class="diagnostics-heading"><h2>Conexões desta sala</h2><button class="button subtle" data-action="export-diagnostics">Salvar diagnóstico</button></div>${rows}${view.watchingPublisherId ? metricPeer(view.watchingPublisherId, `Recebendo de ${selected?.name ?? 'participante'}`, 'inbound') : ''}${!rows && !view.watchingPublisherId ? '<p>Escolha uma transmissão ou aguarde alguém assistir à sua tela.</p>' : ''}<p class="metrics-footnote">Somente as conexões ativas aparecem aqui. O perfil de vídeo é um objetivo, sujeito à fonte, ao computador e à rede.</p></section>`;
  }

  const host = view.room.role === 'host';
  return `<section class="stream-diagnostics" aria-labelledby="diagnostics-heading"><div class="diagnostics-heading"><h2 id="diagnostics-heading">${host ? 'Vídeo enviado em tempo real' : 'Vídeo recebido'}</h2><button class="button subtle" data-action="export-diagnostics">Salvar diagnóstico</button><span>Atualizado a cada 2 s</span></div>${host ? `<div class="capture-summary"><div><span>Captura no computador</span><strong data-stat="capture">—</strong><small>Formato informado pelo sistema.</small></div><div><span>Envio de vídeo total</span><strong data-stat="upload-total">— Mbps</strong><small data-stat="upload-detail">Aguardando conexões.</small></div></div>` : ''}<div class="metric-peer-list">${host ? (view.viewers.length ? view.viewers.map(({ id, name }) => metricPeer(id, name)).join('') : '<p class="metrics-empty">As medições de cada amigo aparecem quando ele entrar e a transmissão começar.</p>') : metricPeer(view.room.hostId!, view.room.hostName)}</div><p class="metrics-footnote">Medições podem variar ou ficar indisponíveis. O perfil selecionado é um objetivo, e os FPS ${host ? 'enviados' : 'recebidos'} dependem também do conteúdo exibido.</p></section>`;
}
