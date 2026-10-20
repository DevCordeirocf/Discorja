import { escapeHtml } from '../ui/components/html';
import { icon } from '../ui/components/icons';
import { renderSidebar, type AppPage } from './design';

export function renderAppShell(options: {
  page: AppPage;
  sidebarCollapsed: boolean;
  displayName: string;
  version: string;
  hasRoom: boolean;
  recovering: boolean;
  hasDesktopApi: boolean;
  notice: { text: string; kind: 'error' | 'info' | 'success' } | null;
  home: string;
  settings: () => string;
  room: string;
  modal: string;
}): string {
  const title = options.page === 'settings' ? 'Configurações' : 'Início';
  const connection = options.hasRoom
    ? options.recovering
      ? 'Reconectando'
      : 'Conectado'
    : 'Pronto para conectar';
  return `<div class="app-shell ${options.sidebarCollapsed ? 'is-collapsed' : ''}"><a class="skip-link" href="#main-content">Ir para o conteúdo</a>${renderSidebar(options.page, options.hasRoom, options.sidebarCollapsed, options.displayName, options.version)}<div class="main-shell"><main id="main-content" class="app-main ${options.page}-main" tabindex="-1">${options.page !== 'room' ? `<header class="page-heading"><h1>${title}</h1><span class="connection-badge ${options.hasRoom && !options.recovering ? 'connected' : ''}">${connection}</span></header>` : ''}${!options.hasDesktopApi ? '<div class="preview-notice">Prévia da interface. Abra o aplicativo desktop para compartilhar sua tela.</div>' : ''}${options.notice ? `<div class="notice ${options.notice.kind}" role="${options.notice.kind === 'error' ? 'alert' : 'status'}" aria-live="${options.notice.kind === 'error' ? 'assertive' : 'polite'}">${icon(options.notice.kind === 'error' ? 'alert' : options.notice.kind === 'success' ? 'check' : 'network')}<span>${escapeHtml(options.notice.text)}</span><button class="icon-button" data-action="dismiss" aria-label="Dispensar aviso">${icon('close')}</button></div>` : ''}<section class="home-page" ${options.page !== 'home' ? 'hidden' : ''}>${options.home}</section>${options.page === 'settings' ? options.settings() : ''}<section id="room-view" ${options.page !== 'room' ? 'hidden' : ''}>${options.room}</section></main></div></div>${options.modal}`;
}
