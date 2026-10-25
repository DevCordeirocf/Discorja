import { DISPLAY_NAME_MAX } from '../../shared/validation';
import { escapeHtml as escape } from '../ui/components/html';

export interface ProfileSettingsView {
  /** The draft being edited: saved values until something changes. */
  name: string;
  photo: string;
}

/** Configurações › Perfil. Ids match the camera and photo handlers. */
export function renderProfileSettings(view: ProfileSettingsView): string {
  const photo = escape(view.photo);
  const initial = escape(
    view.name.trim().charAt(0).toLocaleUpperCase('pt-BR') || '?',
  );
  const shownName = escape(view.name.trim() || 'Seu nome');
  const avatar = (className: string) =>
    `<span class="${className}" aria-hidden="true">${view.photo ? `<img src="${photo}" alt="">` : `<span data-profile-preview-initial>${initial}</span>`}</span>`;
  return `<section class="settings-section profile-settings" aria-labelledby="settings-profile-heading"><header class="settings-section-heading"><div><h2 id="settings-profile-heading">Perfil</h2><p>Como as pessoas vão reconhecer você.</p></div></header>
  <h3 class="settings-group-title">Foto</h3><div class="settings-group settings-group-padded profile-editor"><div class="profile-photo-preview" id="profile-photo-preview"><img id="profile-photo-image" src="${photo}" alt="Sua foto de perfil" ${view.photo ? '' : 'hidden'}><span id="profile-photo-fallback" class="avatar" ${view.photo ? 'hidden' : ''}>${initial}</span><video id="profile-camera-video" autoplay muted playsinline hidden></video><canvas id="profile-camera-canvas" hidden aria-label="Prévia pixelada da câmera"></canvas></div><div class="profile-photo-body"><div class="profile-photo-actions"><input id="profile-photo-file" type="file" accept="image/gif,image/jpeg,image/png,image/webp" hidden><button type="button" class="button primary" data-action="profile-choose-photo">Escolher mídia</button><button type="button" class="button secondary" data-action="profile-start-camera">Abrir câmera</button><button type="button" class="button primary" data-action="profile-capture" disabled hidden>Tirar foto</button><button type="button" class="button subtle" data-action="profile-stop-camera" hidden>Cancelar câmera</button>${view.photo ? '<button type="button" class="button subtle danger-text" data-action="profile-remove-photo">Remover foto</button>' : ''}</div><p class="field-help">JPG, PNG, WebP ou GIF animado. <a href="https://giphy.com/" target="_blank" rel="noopener noreferrer">Procurar GIFs no GIPHY</a></p><p id="profile-camera-status" class="profile-camera-status" role="status"></p></div></div>
  <h3 class="settings-group-title">Identificação</h3><div class="settings-group"><div class="settings-row"><div class="settings-row-copy"><label class="settings-row-title" for="profile-name">Nome de exibição</label><small>Aparece nas salas e em "Online agora".</small></div><div class="settings-row-control"><input id="profile-name" class="text-input" autocomplete="nickname" maxlength="${DISPLAY_NAME_MAX}" required placeholder="Seu nome" value="${escape(view.name)}"></div></div></div>
  <h3 class="settings-group-title">Como você aparece</h3><div class="settings-group settings-group-padded profile-preview" aria-label="Prévia do seu perfil"><div class="profile-preview-item"><small>Online agora</small><span class="online-chip">${avatar('stack-avatar')}<span data-profile-preview-name>${shownName}</span></span></div><div class="profile-preview-item"><small>Na sala</small><span class="profile-preview-tile">${avatar('profile-preview-media')}<span class="profile-preview-caption"><strong><span data-profile-preview-name>${shownName}</span> (você)</strong><small>Na sala</small></span></span></div></div></section>`;
}
