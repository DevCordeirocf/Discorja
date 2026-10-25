import { escapeHtml } from '../ui/components/html';
import { icon } from '../ui/components/icons';
import type { AppPage } from './design';

export function renderAppShell(options: {
  page: AppPage;
  hasDesktopApi: boolean;
  notice: { text: string; kind: 'error' | 'info' | 'success' } | null;
  sidebar: string;
  home: string;
  settings: () => string;
  room: string;
  modal: string;
}): string {
  // Início and the room carry their own headings.
  const heading =
    options.page === 'settings'
      ? '<header class="page-heading"><h1>Configurações</h1></header>'
      : '';
  return `<div class="app-shell has-rail"><a class="skip-link" href="#main-content">Ir para o conteúdo</a>${options.sidebar}<div class="main-shell"><main id="main-content" class="app-main ${options.page}-main" tabindex="-1">${heading}${!options.hasDesktopApi ? '<div class="preview-notice">Prévia da interface. Abra o aplicativo desktop para compartilhar sua tela.</div>' : ''}${options.notice ? `<div class="notice ${options.notice.kind}" role="${options.notice.kind === 'error' ? 'alert' : 'status'}" aria-live="${options.notice.kind === 'error' ? 'assertive' : 'polite'}">${icon(options.notice.kind === 'error' ? 'alert' : options.notice.kind === 'success' ? 'check' : 'network')}<span>${escapeHtml(options.notice.text)}</span><button class="icon-button" data-action="dismiss" aria-label="Dispensar aviso">${icon('close')}</button></div>` : ''}<section class="home-page" ${options.page !== 'home' ? 'hidden' : ''}>${options.home}</section>${options.page === 'settings' ? options.settings() : ''}<section id="room-view" ${options.page !== 'room' ? 'hidden' : ''}>${options.room}</section></main></div></div>${options.modal}`;
}
