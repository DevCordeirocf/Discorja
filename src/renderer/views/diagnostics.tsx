import type { MultiRoomState } from '../../shared/protocol';

export interface DiagnosticsViewProps {
  room: { role: 'host' | 'viewer'; hostId?: string; hostName: string };
  multi: MultiRoomState | null;
  viewers: Array<{ id: string; name: string }>;
  watchingPublisherId?: string;
}

/*
 * The measured values are written by `patchMetrics` (features/quality) every
 * time metrics arrive, without a render. Their elements are rendered empty so
 * React never owns that text; the patch fills them right after each render.
 */

const METRICS = [
  ['Resolução', 'resolution'],
  ['Quadros/s', 'fps'],
  ['Vídeo', 'bitrate'],
  ['Resposta', 'rtt'],
  ['Perda', 'loss'],
  ['Conexão', 'route'],
] as const;

function MetricPeer(props: {
  peerId: string;
  name: string;
  direction?: 'inbound' | 'outbound';
}) {
  return (
    <article
      className="border-t border-[#352b40] py-[14px] first:border-t-0 first:pt-0"
      data-peer-metrics={props.peerId}
      data-direction={props.direction}
    >
      <header className="mb-3 flex items-baseline justify-between gap-3">
        <strong className="truncate text-[10px] font-[550] text-[#c8b5d8]">
          {props.name}
        </strong>
        <span
          className="shrink-0 text-[8px] text-[#a28bad]"
          data-value="status"
        />
      </header>
      <dl className="m-0 grid grid-cols-3 gap-x-[14px] gap-y-3 min-[1200px]:grid-cols-6 min-[1200px]:gap-[9px] max-[860px]:gap-3">
        {METRICS.map(([label, key]) => (
          <div key={key} className="min-w-0">
            <dt className="mb-[5px] text-[8px] text-[#9680a3]">{label}</dt>
            <dd
              className="m-0 text-[10px] leading-[1.5] [overflow-wrap:break-word] text-[#d1c0dc] tabular-nums max-[860px]:text-[9px]"
              data-value={key}
            />
          </div>
        ))}
      </dl>
      <p
        className="mx-0 mt-3 mb-0 text-[8px] leading-[1.8] text-[#a68bb5]"
        data-value="detail"
      />
    </article>
  );
}

const HEADING = 'mb-[15px] flex items-center justify-between gap-[14px]';
const HEADING_TITLE =
  'm-0 text-[13px] font-semibold tracking-[-0.15px] max-[1050px]:text-[12px]';
const FOOTNOTE =
  'mx-0 mt-[5px] mb-0 border-t border-[#352b40] pt-3 text-[8px] leading-[1.9] text-[#9b87aa]';

function ExportButton() {
  return (
    <button className="button subtle" data-action="export-diagnostics">
      Salvar diagnóstico
    </button>
  );
}

function SummaryCard(props: {
  label: string;
  stat: string;
  note?: string;
  noteStat?: string;
}) {
  return (
    <div className="min-w-0 rounded-[6px] border border-[#3a2e46] bg-[#231d2b] p-3 max-[1050px]:p-[9px]">
      <span className="mb-[7px] block text-[8px] text-[#a590b4]">
        {props.label}
      </span>
      <strong
        className="block text-[11px] leading-[1.6] font-[550] text-[#d4bddf] tabular-nums max-[1050px]:text-[10px]"
        data-stat={props.stat}
      />
      <small
        className="mt-[3px] block text-[8px] leading-[1.7] text-[#9781a5]"
        data-stat={props.noteStat}
      >
        {props.note}
      </small>
    </div>
  );
}

// `stream-diagnostics` stays as a hook for the smoke tests.
export function DiagnosticsPanel(view: DiagnosticsViewProps) {
  if (view.multi) {
    const selected = view.multi.participants.find(
      (person) => person.peerId === view.watchingPublisherId,
    );
    return (
      <section
        className="stream-diagnostics m-0 p-0"
        aria-label="Diagnóstico de envio e recepção"
      >
        <div className={HEADING}>
          <h2 className={HEADING_TITLE}>Conexões desta sala</h2>
          <ExportButton />
        </div>
        {view.viewers.map((person) => (
          <MetricPeer
            key={person.id}
            peerId={person.id}
            name={`Enviando para ${person.name}`}
            direction="outbound"
          />
        ))}
        {view.watchingPublisherId && (
          <MetricPeer
            peerId={view.watchingPublisherId}
            name={`Recebendo de ${selected?.name ?? 'participante'}`}
            direction="inbound"
          />
        )}
        {!view.viewers.length && !view.watchingPublisherId && (
          <p>Escolha uma transmissão ou aguarde alguém assistir à sua tela.</p>
        )}
        <p className={FOOTNOTE}>
          Somente as conexões ativas aparecem aqui. O perfil de vídeo é um
          objetivo, sujeito à fonte, ao computador e à rede.
        </p>
      </section>
    );
  }

  const host = view.room.role === 'host';
  return (
    <section
      className="stream-diagnostics m-0 p-0"
      aria-labelledby="diagnostics-heading"
    >
      <div className={HEADING}>
        <h2 id="diagnostics-heading" className={HEADING_TITLE}>
          {host ? 'Vídeo enviado em tempo real' : 'Vídeo recebido'}
        </h2>
        <ExportButton />
        <span className="text-[8px] text-[#887594] max-[860px]:text-[7px]">
          Atualizado a cada 2 s
        </span>
      </div>
      {host && (
        <div className="mx-0 mt-0 mb-[19px] grid grid-cols-[1.2fr_1fr] gap-[13px] max-[1050px]:grid-cols-[1fr_1fr] max-[1050px]:gap-[9px] max-[860px]:grid-cols-[1fr]">
          <SummaryCard
            label="Captura no computador"
            stat="capture"
            note="Formato informado pelo sistema."
          />
          <SummaryCard
            label="Envio de vídeo total"
            stat="upload-total"
            noteStat="upload-detail"
          />
        </div>
      )}
      <div>
        {host ? (
          view.viewers.length ? (
            view.viewers.map(({ id, name }) => (
              <MetricPeer key={id} peerId={id} name={name} />
            ))
          ) : (
            <p className="m-0 pt-0.5 pb-4 text-[9px] leading-[1.9] text-[#9b87aa]">
              As medições de cada amigo aparecem quando ele entrar e a
              transmissão começar.
            </p>
          )
        ) : (
          <MetricPeer peerId={view.room.hostId!} name={view.room.hostName} />
        )}
      </div>
      <p className={FOOTNOTE}>
        Medições podem variar ou ficar indisponíveis. O perfil selecionado é um
        objetivo, e os FPS {host ? 'enviados' : 'recebidos'} dependem também do
        conteúdo exibido.
      </p>
    </section>
  );
}
