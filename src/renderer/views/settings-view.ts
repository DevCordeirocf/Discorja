import type { AppConfig, UpdateState } from '../../shared/protocol';
import { escapeHtml as escape } from '../html';

export interface SettingsView {
  config: AppConfig;
  update: UpdateState;
  serverUrl: string;
  connected: boolean;
  disabled: boolean;
  saving: boolean;
  testing: boolean;
  connectionStatus: string;
  qualityControls: string;
}

export function renderSettingsView(view: SettingsView): string {
  const { config, update } = view;
  const updateText: Record<UpdateState['status'], string> = {
    disabled: 'Atualizações não configuradas nesta instalação.',
    idle: 'Avisamos ao abrir o app quando houver uma nova versão.',
    checking: 'Procurando uma nova versão…',
    available: `Versão ${update.version ?? ''} disponível.`,
    downloading: `Baixando atualização · ${Math.round(update.percent ?? 0)}%`,
    downloaded: 'Atualização pronta. Reinicie para instalar.',
    error: update.message ?? 'Não foi possível consultar atualizações.',
    current: 'Você está na versão mais recente.',
  };
  return `<div class="settings-page"><div class="settings-column"><section class="settings-card transmission-settings"><h2>Transmissão</h2>${view.qualityControls}</section><section class="settings-card server-settings"><h2>Servidor de sinalização</h2><form id="settings-form"><label class="sr-only" for="signaling-url">Servidor de sinalização</label><input id="signaling-url" class="text-input" type="url" required spellcheck="false" autocomplete="off" placeholder="wss://seu-servidor.exemplo" value="${escape(view.serverUrl)}" ${view.connected || view.saving ? 'disabled' : ''}><div class="server-actions"><span class="connection-badge ${view.connected ? 'connected' : ''}" role="status">${escape(view.connectionStatus)}</span><button type="button" class="button subtle" data-action="test-connection" ${view.connected || view.testing || view.saving ? 'disabled' : ''}>${view.testing ? 'Testando…' : 'Testar conexão'}</button></div>${view.connected ? '<p class="settings-warning">Saia da sala para alterar o servidor.</p>' : ''}</form></section></div><div class="settings-column"><section class="settings-card update-card"><h2>Atualizações</h2><p>Versão instalada · ${escape(config.version)}</p><p class="settings-caption" role="status">${escape(updateText[update.status])}</p>${update.status === 'available' ? '<button class="button secondary wide" data-action="download-update">Baixar atualização</button>' : update.status === 'downloaded' ? '<button class="button secondary wide" data-action="install-update">Reiniciar e instalar</button>' : `<button class="button secondary wide" data-action="check-update" ${!config.updatesConfigured || ['checking', 'downloading'].includes(update.status) ? 'disabled' : ''}>Verificar atualizações</button>`}</section><section class="settings-card logs-card"><h2>Logs de erros</h2><p>Exporte os registros para investigar falhas de conexão.</p><button class="button secondary wide" data-action="export-logs">Salvar logs de erros</button></section><div class="settings-page-actions"><button class="button subtle" data-action="close-settings" aria-label="Fechar configurações">Voltar</button><button class="button primary" form="settings-form" type="submit" ${view.disabled || view.connected || view.saving ? 'disabled' : ''}>${view.saving ? 'Salvando…' : 'Salvar configurações'}</button></div></div></div>`;
}
