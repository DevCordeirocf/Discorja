import type {
  ChangeKind,
  ChangelogEntry,
} from '../features/whats-new/changelog';
import {
  MODAL_BODY,
  Modal,
  ModalDescription,
  ModalFooter,
  ModalHeading,
  ModalTitle,
} from './modal';

const KIND_LABEL: Record<ChangeKind, string> = {
  novo: 'Novo',
  melhoria: 'Melhoria',
  correção: 'Correção',
};
const KIND_STYLE: Record<ChangeKind, string> = {
  novo: 'border-purple text-purple',
  melhoria: 'border-mint text-mint',
  correção: 'border-line text-text',
};
const KIND_ORDER: ChangeKind[] = ['novo', 'melhoria', 'correção'];

const formatDate = (value: string) => {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('pt-BR', { dateStyle: 'long' });
};

function Release({ entry, first }: { entry: ChangelogEntry; first: boolean }) {
  const headingId = `whats-new-${entry.version.replaceAll('.', '-')}`;
  const items = KIND_ORDER.flatMap((kind) =>
    entry.items.filter((item) => item.kind === kind),
  );
  return (
    <section
      className={first ? '' : 'mt-5 border-t border-line pt-[18px]'}
      aria-labelledby={headingId}
    >
      <h3
        id={headingId}
        className="mx-0 mt-0 mb-2.5 flex items-baseline gap-2.5 [font:600_14px_var(--font-display)] text-text"
      >
        Versão {entry.version}{' '}
        <span className="text-[11px] font-normal text-faint">
          {formatDate(entry.date)}
        </span>
      </h3>
      <ul className="m-0 grid list-none gap-2 p-0">
        {items.map((item, index) => (
          <li
            key={index}
            className="flex items-start gap-2.5 text-[12px] leading-[1.5] text-muted"
          >
            <span
              className={`min-w-[70px] flex-none rounded-full border px-2 py-0.5 text-center text-[10px] font-semibold ${KIND_STYLE[item.kind]}`}
            >
              {KIND_LABEL[item.kind]}
            </span>
            <span>{item.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function WhatsNewModal(props: {
  version: string;
  entries: ChangelogEntry[];
}) {
  return (
    <Modal
      labelledBy="whats-new-title"
      className={`w-[min(560px,calc(100vw-32px))] ${MODAL_BODY}`}
    >
      <ModalHeading
        className="mb-[31px] items-start"
        close={{ action: 'close-whats-new', label: 'Fechar novidades' }}
      >
        <div>
          <ModalTitle id="whats-new-title">Novidades do Discorja</ModalTitle>
          <ModalDescription>
            Você está na versão {props.version}.
          </ModalDescription>
        </div>
      </ModalHeading>
      <div
        className="max-h-[min(56vh,520px)] overflow-y-auto pr-1.5"
        data-scroll-preserve="whats-new"
      >
        {props.entries.length ? (
          props.entries.map((entry, index) => (
            <Release key={entry.version} entry={entry} first={index === 0} />
          ))
        ) : (
          <ModalDescription>
            Nenhuma novidade registrada para esta versão.
          </ModalDescription>
        )}
      </div>
      <ModalFooter>
        <button className="button primary" data-action="close-whats-new">
          Entendi
        </button>
      </ModalFooter>
    </Modal>
  );
}
