import type { AppConfig, UpdateState } from '../../shared/protocol';
import { escapeHtml as escape } from '../ui/components/html';
import { icon } from '../ui/components/icons';
import { logoUrl } from './design';

export const SETTINGS_SECTIONS = [
  { id: 'perfil', label: 'Perfil', icon: 'user' },
  { id: 'transmissao', label: 'Transmissão', icon: 'screen' },
  { id: 'conexao', label: 'Conexão', icon: 'globe' },
  { id: 'atualizacoes', label: 'Atualizações', icon: 'download' },
  { id: 'diagnostico', label: 'Diagnóstico', icon: 'activity' },
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['id'];

export function isSettingsSection(value: unknown): value is SettingsSection {
  return SETTINGS_SECTIONS.some((section) => section.id === value);
}

export interface SettingsView {
  section: SettingsSection;
  config: AppConfig;
  update: UpdateState;
  serverUrl: string;
  connected: boolean;
  saving: boolean;
  testing: boolean;
  connectionStatus: string;
  /** Where "Voltar" leads: the room in use or Início. */
  backTo: 'room' | 'home';
  /** Unsaved profile or server changes; shows the save bar. */
  dirty: boolean;
  qualityControls: string;
  profileControls: string;
}

const UPDATE_TEXT: Record<
  UpdateState['status'],
  (update: UpdateState) => string
> = {
  disabled: () => 'Atualizações não configuradas nesta instalação.',
  idle: () => 'Avisamos ao abrir o app quando houver uma nova versão.',
  checking: () => 'Procurando uma nova versão…',
  available: (update) => `Versão ${update.version ?? ''} disponível.`,
  downloading: (update) =>
    `Baixando atualização · ${Math.round(update.percent ?? 0)}%`,
  downloaded: () => 'Atualização pronta. Reinicie para instalar.',
  error: (update) =>
    update.message ?? 'Não foi possível consultar atualizações.',
  current: () => 'Você está na versão mais recente.',
};

function heading(id: string, title: string, description: string): string {
  return `<header class="settings-section-heading"><div><h2 id="${id}">${title}</h2><p>${description}</p></div></header>`;
}

function renderConnection(view: SettingsView): string {
  const locked = view.connected || view.saving;
  return `<section class="settings-section server-settings" aria-labelledby="settings-server-heading">${heading('settings-server-heading', 'Conexão', 'Todos da sala precisam usar o mesmo servidor.')}<h3 class="settings-group-title">Servidor de sinalização</h3><div class="settings-group settings-group-padded"><label class="settings-row-title" for="signaling-url">Endereço</label><div class="server-field"><input id="signaling-url" class="text-input" type="url" required spellcheck="false" autocomplete="off" placeholder="wss://seu-servidor.exemplo" value="${escape(view.serverUrl)}" ${locked ? 'disabled' : ''}><button type="button" class="button secondary" data-action="test-connection" ${view.connected || view.testing || view.saving ? 'disabled' : ''}>${view.testing ? 'Testando…' : 'Testar conexão'}</button></div><span class="connection-badge ${view.connected ? 'connected' : ''}" role="status">${escape(view.connectionStatus)}</span>${view.connected ? '<p class="settings-warning">Saia da sala para alterar o servidor.</p>' : ''}</div></section>`;
}

function renderUpdates(view: SettingsView): string {
  const { config, update } = view;
  const action =
    update.status === 'available'
      ? '<button type="button" class="button primary" data-action="download-update">Baixar atualização</button>'
      : update.status === 'downloaded'
        ? '<button type="button" class="button primary" data-action="install-update">Reiniciar e instalar</button>'
        : `<button type="button" class="button secondary" data-action="check-update" ${!config.updatesConfigured || ['checking', 'downloading'].includes(update.status) ? 'disabled' : ''}>Verificar atualizações</button>`;
  return `<section class="settings-section update-card" aria-labelledby="settings-update-heading">${heading('settings-update-heading', 'Atualizações', 'Avisamos ao abrir o app quando houver uma nova versão.')}<div class="settings-group settings-version-card"><div class="settings-version"><img class="settings-version-logo" src="${logoUrl}" alt="" width="48" height="48"><div><strong>Discorja ${escape(config.version)}</strong><small class="settings-caption update-${update.status}" role="status">${escape(UPDATE_TEXT[update.status](update))}</small></div></div>${action}</div><div class="settings-group"><div class="settings-row"><div class="settings-row-copy"><span class="settings-row-title">Novidades</span><small>O que mudou nesta versão.</small></div><div class="settings-row-control"><button type="button" class="button secondary" data-action="open-whats-new">Ver novidades</button></div></div></div></section>`;
}

function renderDiagnosticsSection(): string {
  return `<section class="settings-section logs-card" aria-labelledby="settings-logs-heading">${heading('settings-logs-heading', 'Diagnóstico', 'Registros para investigar falhas de conexão.')}<div class="settings-group"><div class="settings-row"><div class="settings-row-copy"><span class="settings-row-title">Logs de erros</span><small>Sem convites, tokens, SDP ou conteúdo de tela.</small></div><div class="settings-row-control"><button type="button" class="button secondary" data-action="export-logs">Salvar logs</button></div></div></div></section>`;
}

export function renderSettingsView(view: SettingsView): string {
  const back = view.backTo === 'room' ? 'Voltar à sala' : 'Voltar ao Início';
  const updateReady = ['available', 'downloaded'].includes(view.update.status);
  const nav = SETTINGS_SECTIONS.map(
    (section) =>
      `<button type="button" class="settings-nav-item" data-action="settings-section" data-section="${section.id}" ${section.id === view.section ? 'aria-current="page"' : ''}>${icon(section.icon)}<span>${section.label}</span>${section.id === 'atualizacoes' && updateReady ? '<span class="settings-nav-dot" role="img" aria-label="Atualização disponível"></span>' : ''}</button>`,
  ).join('');
  const content =
    view.section === 'perfil'
      ? view.profileControls
      : view.section === 'transmissao'
        ? view.qualityControls
        : view.section === 'conexao'
          ? renderConnection(view)
          : view.section === 'atualizacoes'
            ? renderUpdates(view)
            : renderDiagnosticsSection();
  return `<div class="settings-layout"><nav class="settings-nav" aria-label="Seções das configurações"><button type="button" class="settings-back" data-action="close-settings" aria-label="Fechar configurações e ${back.toLocaleLowerCase('pt-BR')}"><span class="settings-back-icon">${icon('back')}</span><span>${back}</span><kbd>Esc</kbd></button><h1>Configurações</h1>${nav}<span class="settings-nav-version">Discorja ${escape(view.config.version)}</span></nav><div class="settings-content" data-scroll-preserve="settings-content"><form id="settings-form" class="settings-page" novalidate>${content}</form><div class="settings-savebar" role="region" aria-label="Alterações não salvas" ${view.dirty ? '' : 'hidden'}><span>Você tem alterações não salvas.</span><div><button type="button" class="button subtle" data-action="discard-settings">Descartar</button><button type="submit" class="button primary" form="settings-form" ${view.saving ? 'disabled' : ''}>${view.saving ? 'Salvando…' : 'Salvar alterações'}</button></div></div></div></div>`;
}
