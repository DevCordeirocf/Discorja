import type { CaptureSource, UpdateState } from '../../shared/protocol';
import { escapeHtml } from '../ui/components/html';
import { icon } from '../ui/components/icons';

export type AppModal =
  | 'settings'
  | 'sources'
  | 'update'
  | 'switch'
  | 'diagnostics'
  | 'profile'
  | 'create'
  | null;
interface ModalView {
  modal: AppModal;
  isRoomOwner: boolean;
  update: UpdateState;
  version: string;
  hasRoom: boolean;
  renderDiagnostics: () => string;
  sources: CaptureSource[];
  selectedSource: string;
  busy: 'room' | 'sources' | 'capture' | 'settings' | null;
  sourcePage: 'screen' | 'window';
  displayName: string;
  profilePhoto: string;
}

export function renderModal(options: ModalView): string {
  const {
    modal,
    isRoomOwner,
    update,
    version,
    hasRoom,
    renderDiagnostics,
    sources,
    selectedSource,
    busy,
    sourcePage,
    displayName,
    profilePhoto,
  } = options;
  if (!modal) return '';
  if (modal === 'create')
    return `<div class="modal-overlay"><section class="modal settings-modal create-room-modal" role="dialog" aria-modal="true" aria-labelledby="create-room-title"><div class="modal-heading"><div><h2 id="create-room-title">Criar sala</h2><p class="modal-description">Escolha um código para compartilhar com as pessoas.</p></div><button class="icon-button" data-action="close-modal" aria-label="Fechar">${icon('close')}</button></div><form id="create-room-form"><label class="field-label" for="create-room-code">Código personalizado <span>(opcional)</span></label><div class="create-room-code-row"><input class="text-input" id="create-room-code" aria-label="Código personalizado com 8 caracteres" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="8" placeholder="8 caracteres"><button type="button" class="button secondary" data-action="generate-room-code">Gerar</button></div><p class="field-help">Use 8 caracteres imprimíveis; símbolos, espaços, letras e números são aceitos. Deixe vazio para gerar automaticamente.</p><div class="create-room-code-actions"><button type="button" class="button subtle" data-action="use-last-created-room-code">Usar último código</button></div><div class="modal-footer"><button type="button" class="button subtle" data-action="close-modal">Cancelar</button><button class="button primary" type="submit">Criar sala</button></div></form></section></div>`;
  if (modal === 'profile')
    return `<div class="modal-overlay profile-overlay"><section class="modal profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title"><div class="modal-heading"><div><h2 id="profile-modal-title">Seu perfil</h2><p class="profile-modal-intro">Como as pessoas vão reconhecer você.</p></div><button class="icon-button" data-action="close-modal" aria-label="Fechar perfil">${icon('close')}</button></div><form id="profile-form"><div class="profile-editor"><div class="profile-photo-preview" id="profile-photo-preview"><img id="profile-photo-image" src="${escapeHtml(profilePhoto)}" alt="Sua foto de perfil" ${profilePhoto ? '' : 'hidden'}><span id="profile-photo-fallback" class="avatar" ${profilePhoto ? 'hidden' : ''}>${escapeHtml(displayName.trim().charAt(0).toLocaleUpperCase('pt-BR') || '?')}</span><video id="profile-camera-video" autoplay muted playsinline hidden></video><canvas id="profile-camera-canvas" hidden aria-label="Prévia pixelada da câmera"></canvas></div><div class="profile-photo-actions"><input id="profile-photo-file" type="file" accept="image/*" hidden><button type="button" class="button secondary" data-action="profile-choose-photo">Escolher foto</button><button type="button" class="button subtle" data-action="profile-start-camera">Abrir câmera</button><button type="button" class="button primary" data-action="profile-capture" disabled>Tirar foto</button><button type="button" class="button subtle" data-action="profile-stop-camera" hidden>Cancelar câmera</button>${profilePhoto ? '<button type="button" class="button subtle" data-action="profile-remove-photo">Remover foto</button>' : ''}</div></div><p id="profile-camera-status" class="profile-camera-status" role="status">A câmera só será ativada quando você escolher abrir.</p><div class="profile-name-section"><label class="profile-name-field" for="profile-name">Nome de exibição</label><input id="profile-name" class="text-input" autocomplete="nickname" maxlength="32" required placeholder="Seu nome" value="${escapeHtml(displayName)}"></div><div class="modal-footer"><button type="button" class="button subtle" data-action="close-modal">Cancelar</button><button class="button primary" type="submit">Salvar perfil</button></div></form></section></div>`;
  if (modal === 'switch')
    return `<div class="modal-overlay"><section class="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><h2 id="modal-title">Trocar de sala?</h2><p class="modal-description">A transmissão e a reprodução atuais serão encerradas antes de conectar à próxima sala.${isRoomOwner ? ' Como você é o dono, a sala atual será encerrada para todos.' : ''} A próxima conexão pode falhar; nenhuma captura será reiniciada automaticamente.</p><div class="modal-footer"><button class="button subtle" data-action="cancel-switch">Continuar nesta sala</button><button class="button primary" data-action="confirm-switch">Trocar de sala</button></div></section></div>`;
  if (modal === 'update')
    return `<div class="modal-overlay"><section class="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-heading"><h2 id="modal-title">${update.status === 'downloaded' ? 'Atualização pronta' : 'Atualização disponível'}</h2></div><p class="modal-description">Versão instalada: ${escapeHtml(version)}. Nova versão: ${escapeHtml(update.version ?? 'disponível')}.</p><p role="status">${update.status === 'downloading' ? `Baixando… ${Math.round(update.percent ?? 0)}%` : update.status === 'error' ? escapeHtml(update.message ?? 'Falha ao atualizar. Tente novamente nas configurações.') : update.status === 'downloaded' ? 'O aplicativo será reiniciado para instalar.' : 'Uma nova versão do Discorja está disponível.'}</p>${hasRoom ? '<p class="settings-warning">Reiniciar encerrará sua participação e qualquer transmissão ativa.</p>' : ''}<div class="modal-footer"><button class="button subtle" data-action="defer-update">Depois</button>${update.status === 'downloaded' ? '<button class="button primary" data-action="confirm-install-update">Reiniciar e atualizar</button>' : update.status === 'available' ? '<button class="button primary" data-action="download-update">Atualizar agora</button>' : ''}</div></section></div>`;
  if (modal === 'diagnostics')
    return `<div class="modal-overlay diagnostics-overlay"><section class="modal diagnostics-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-heading"><h2 id="modal-title">Diagnóstico da conexão</h2><button class="icon-button" data-action="close-modal" aria-label="Fechar diagnóstico">${icon('close')}</button></div><div class="diagnostics-modal-content">${renderDiagnostics()}</div></section></div>`;
  if (modal === 'sources') {
    const renderSource = (source: CaptureSource, index: number) =>
      `<button id="source-${index}" class="source-option ${selectedSource === source.id ? 'selected' : ''}" data-action="select-source" data-source="${escapeHtml(source.id)}" aria-pressed="${selectedSource === source.id}" ${busy === 'capture' ? 'disabled' : ''}><div class="source-thumbnail">${source.thumbnail ? `<img src="${escapeHtml(source.thumbnail)}" alt="Prévia de ${escapeHtml(source.name)}">` : icon(source.kind === 'screen' ? 'screen' : 'window')}<span class="source-check">${icon('check')}</span></div><span class="source-name">${icon(source.kind === 'screen' ? 'screen' : 'window')}<span>${escapeHtml(source.name)}</span></span></button>`;
    const screens = sources
      .map((source, index) => ({ source, index }))
      .filter(({ source }) => source.kind === 'screen');
    const windows = sources
      .map((source, index) => ({ source, index }))
      .filter(({ source }) => source.kind === 'window');
    const visibleSources = sourcePage === 'screen' ? screens : windows;
    const tabId =
      sourcePage === 'screen' ? 'source-tab-screen' : 'source-tab-guides';
    const sourceItems = visibleSources.length
      ? `<div class="source-grid">${visibleSources.map(({ source, index }) => renderSource(source, index)).join('')}</div>`
      : `<div class="source-empty">Nenhuma ${sourcePage === 'screen' ? 'tela' : 'guia'} disponível.</div>`;
    return `<div class="modal-overlay" data-scroll-preserve="source-overlay"><section class="modal source-modal" data-scroll-preserve="source-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div class="modal-heading"><h2 id="modal-title">Compartilhar</h2><button class="icon-button" data-action="cancel-sources" aria-label="Fechar">${icon('close')}</button></div><div class="source-tabs" role="tablist" aria-label="Tipo de compartilhamento"><button id="source-tab-screen" class="source-tab" role="tab" aria-selected="${sourcePage === 'screen'}" aria-controls="source-panel" tabindex="${sourcePage === 'screen' ? '0' : '-1'}" data-action="source-tab" data-source-kind="screen" ${busy ? 'disabled' : ''}>Tela</button><button id="source-tab-guides" class="source-tab" role="tab" aria-selected="${sourcePage === 'window'}" aria-controls="source-panel" tabindex="${sourcePage === 'window' ? '0' : '-1'}" data-action="source-tab" data-source-kind="window" ${busy ? 'disabled' : ''}>Guias</button></div>${busy === 'sources' ? '<div class="source-loading"><span class="spinner"></span> Carregando…</div>' : `<div id="source-panel" class="source-groups" data-scroll-preserve="source-groups" role="tabpanel" aria-labelledby="${tabId}">${sourceItems}</div>`}<div class="source-audio-slot"></div><div class="modal-footer"><button class="button subtle" data-action="refresh-sources" ${busy ? 'disabled' : ''}>Atualizar</button><button class="button primary" data-action="start-share" ${!selectedSource || busy ? 'disabled' : ''}>${busy === 'capture' ? '<span class="spinner"></span> Iniciando…' : 'Iniciar'}</button></div></section></div>`;
  }
  return '';
}
