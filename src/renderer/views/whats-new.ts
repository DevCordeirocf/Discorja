import type {
  ChangeKind,
  ChangelogEntry,
} from '../features/whats-new/changelog';
import { escapeHtml as escape } from '../ui/components/html';
import { icon } from '../ui/components/icons';

const KIND_LABEL: Record<ChangeKind, string> = {
  novo: 'Novo',
  melhoria: 'Melhoria',
  correção: 'Correção',
};
const KIND_ORDER: ChangeKind[] = ['novo', 'melhoria', 'correção'];

const formatDate = (value: string) => {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString('pt-BR', { dateStyle: 'long' });
};

export function renderWhatsNewModal(view: {
  version: string;
  entries: ChangelogEntry[];
}): string {
  const releases = view.entries.length
    ? view.entries
        .map((entry) => {
          const items = KIND_ORDER.flatMap((kind) =>
            entry.items
              .filter((item) => item.kind === kind)
              .map(
                (item) =>
                  `<li class="whats-new-item"><span class="whats-new-badge kind-${kind === 'correção' ? 'correcao' : kind}">${KIND_LABEL[kind]}</span><span>${escape(item.text)}</span></li>`,
              ),
          ).join('');
          return `<section class="whats-new-release" aria-labelledby="whats-new-${escape(entry.version.replaceAll('.', '-'))}"><h3 id="whats-new-${escape(entry.version.replaceAll('.', '-'))}">Versão ${escape(entry.version)} <span>${escape(formatDate(entry.date))}</span></h3><ul>${items}</ul></section>`;
        })
        .join('')
    : '<p class="modal-description">Nenhuma novidade registrada para esta versão.</p>';
  return `<div class="modal-overlay"><section class="modal settings-modal whats-new-modal" role="dialog" aria-modal="true" aria-labelledby="whats-new-title"><div class="modal-heading"><div><h2 id="whats-new-title">Novidades do Discorja</h2><p class="modal-description">Você está na versão ${escape(view.version)}.</p></div><button class="icon-button" data-action="close-whats-new" aria-label="Fechar novidades">${icon('close')}</button></div><div class="whats-new-content" data-scroll-preserve="whats-new">${releases}</div><div class="modal-footer"><button class="button primary" data-action="close-whats-new">Entendi</button></div></section></div>`;
}
