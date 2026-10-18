import { escapeHtml as escape } from '../html';

export interface HomeView {
  enabled: boolean;
  busy: boolean;
  connecting: boolean;
  displayName: string;
  editingName: boolean;
  joinCode: string;
}

export function renderHome(view: HomeView): string {
  const disabled = !view.enabled || view.busy;
  return `<section class="home-content" aria-label="Início"><div class="home-copy"><h1>Censura? Aqui não</h1><h2>A tecnologia é apenas uma ferramenta.</h2><p>o problema não é a criação, mas o uso que se faz dela.</p><p class="home-invitation">Crie uma sala e convide alguem</p></div>${!view.displayName.trim() || view.editingName ? `<form id="profile-form" class="identity-field"><label for="display-name">Seu nome</label><input id="display-name" class="text-input" autocomplete="nickname" maxlength="32" required placeholder="Seu nome" value="${escape(view.displayName)}" ${view.busy ? 'disabled' : ''}>${view.editingName ? '<button class="button secondary" type="submit">Salvar nome</button>' : ''}</form>` : ''}<div class="start-grid"><article class="start-card create-card"><h2>Criar sala</h2><p>Escolha uma janela ou tela para compartilhar.</p><button class="button primary wide" data-action="create" ${disabled ? 'disabled' : ''}>${view.connecting ? '<span class="spinner"></span> Conectando…' : '+  Criar sala'}</button></article><article class="start-card join-card"><h2>Entrar com código</h2><form id="join-form"><label class="sr-only" for="room-code">Código da sala com 8 caracteres</label><div class="join-input join-form"><input class="text-input" id="room-code" aria-label="Código da sala com 8 caracteres" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="9" placeholder="Código da sala" value="${escape(view.joinCode)}" ${view.busy ? 'disabled' : ''}><button type="submit" class="join-button button secondary" aria-label="Entrar na sala" ${disabled ? 'disabled' : ''}>→</button></div></form><span class="field-help">8 caracteres</span></article></div><footer class="home-credit"><span>Criado por Pretágoras</span><span>Sem Janja, apenas transmissão.</span></footer></section>`;
}
