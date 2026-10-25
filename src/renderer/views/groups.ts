import type { GroupsViewState } from '../features/groups/groups-feature';
import type { GroupRoom } from '../../shared/protocol';
import { GROUP_NAME_MAX } from '../../shared/groups';
import { DISPLAY_NAME_MAX } from '../../shared/validation';
import { escapeHtml as escape } from '../ui/components/html';
import { icon } from '../ui/components/icons';

const STATUS_TEXT: Record<GroupsViewState['status'], string> = {
  idle: '',
  connecting: 'Conectando ao servidor…',
  waking: 'Acordando o servidor… isso pode levar até 1 minuto.',
  online: '',
  unsupported:
    'O servidor ainda não suporta grupos. Atualize o servidor de sinalização.',
  offline: 'Sem conexão com o servidor. Tentando de novo…',
};

export interface GroupHomeView extends GroupsViewState {
  enabled: boolean;
  displayName: string;
  /** Code of the room this app is in, to mark its card. */
  currentRoomCode: string | null;
  menuOpen: boolean;
}

/** Two letters for the group button: the first letters of the first two words. */
export function groupInitials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  const letters =
    words.length > 1
      ? [...words[0]!][0]! + [...words[1]!][0]!
      : [...(words[0] ?? '?')].slice(0, 2).join('');
  return letters.toLocaleUpperCase('pt-BR');
}

function groupForms(
  prefix: string,
  view: Pick<GroupHomeView, 'draftName' | 'draftInvite' | 'enabled'>,
  heading: 'h2' | 'h3',
): { create: string; join: string } {
  const disabled = view.enabled ? '' : 'disabled';
  return {
    create: `<form class="group-form" data-group-form="create"><${heading}>Criar grupo</${heading}><label class="field-label" for="${prefix}-group-name">Nome do grupo</label><input id="${prefix}-group-name" class="text-input" data-group-field="name" maxlength="${GROUP_NAME_MAX}" autocomplete="off" placeholder="Ex.: Calvos de Terno" value="${escape(view.draftName)}"><button class="button primary wide" type="submit" ${disabled}>Criar grupo</button></form>`,
    join: `<form class="group-form" data-group-form="join"><${heading}>Entrar com convite</${heading}><label class="field-label" for="${prefix}-group-invite">Cole o convite que você recebeu</label><input id="${prefix}-group-invite" class="text-input" data-group-field="invite" autocomplete="off" spellcheck="false" placeholder="DJG1…" value="${escape(view.draftInvite)}"><button class="button secondary wide" type="submit" ${disabled}>Entrar no grupo</button></form>`,
  };
}

function renderWelcome(view: GroupHomeView): string {
  const forms = groupForms('welcome', view, 'h2');
  const name = view.displayName.trim()
    ? ''
    : `<div class="welcome-name"><label class="field-label" for="display-name">Seu nome</label><input id="display-name" class="text-input" autocomplete="nickname" maxlength="${DISPLAY_NAME_MAX}" placeholder="" value="${escape(view.displayName)}"></div>`;
  return `<section class="group-welcome" aria-labelledby="welcome-title"><header><h1 id="welcome-title">Bem-vindo ao Discorja</h1><p>As salas ficam dentro dos grupos. Crie um grupo e convide alguém, ou entre com o convite que você recebeu.</p></header>${name}<div class="welcome-forms"><div class="welcome-card welcome-create">${forms.create}</div><div class="welcome-card">${forms.join}</div></div><footer class="home-credit"><span>Criado por <a href="https://github.com/DevCordeiroCf" target="_blank" rel="noopener noreferrer">DevCordeiroCf</a></span></footer></section>`;
}

function renderRoomCard(
  room: GroupRoom,
  view: GroupHomeView,
  canUse: boolean,
): string {
  const here = room.code === view.currentRoomCode;
  const full = !here && room.participants >= room.maxParticipants;
  const status = room.publications
    ? `<span class="live-badge"><span aria-hidden="true">●</span> ${room.publications} ${room.publications === 1 ? 'tela' : 'telas'} ao vivo</span>`
    : '<span class="room-card-idle">Sem tela ao vivo</span>';
  const shown = room.members.slice(0, 4);
  const extra = room.participants - shown.length;
  const avatars = `${shown.map((member, index) => `<span class="stack-avatar tone-${index % 5}">${escape([...member.trim()][0]?.toLocaleUpperCase('pt-BR') ?? '?')}</span>`).join('')}${extra > 0 ? `<span class="stack-avatar stack-more">+${extra}</span>` : ''}`;
  const people = room.members.length
    ? `Na sala: ${room.members.map((member) => escape(member)).join(', ')}`
    : 'Sala vazia';
  const button = here
    ? '<button type="button" class="button room-card-here" data-action="room">Você está aqui</button>'
    : `<button type="button" class="button ${full ? 'subtle' : 'outline'}" data-action="join-group-room" data-code="${escape(room.code)}" aria-label="${full ? `Sala ${escape(room.name)} cheia` : `Entrar na sala ${escape(room.name)}`}" ${canUse && !full ? '' : 'disabled'}>${full ? 'Sala cheia' : 'Entrar'}</button>`;
  return `<li class="room-card"><div class="room-card-top"><h3>${escape(room.name)}</h3>${status}</div><div class="room-card-people"><span class="avatar-stack" role="img" aria-label="${people}">${avatars}</span><span class="room-card-count">${room.participants}/${room.maxParticipants}</span></div>${button}</li>`;
}

/** The person's photo when it has arrived; otherwise the initial. */
function renderOnlineAvatar(
  name: string,
  photo: string,
  index: number,
): string {
  return photo
    ? `<span class="stack-avatar has-photo" aria-hidden="true"><img src="${escape(photo)}" alt=""></span>`
    : `<span class="stack-avatar tone-${index % 5}" aria-hidden="true">${escape([...name.trim()][0]?.toLocaleUpperCase('pt-BR') ?? '?')}</span>`;
}

function renderGroupPage(view: GroupHomeView): string {
  const selected = view.selected!;
  const canUse = view.enabled && view.status === 'online';
  const rooms = view.listing?.rooms ?? [];
  const online = view.listing?.online ?? [];
  const live = rooms.filter((room) => room.publications > 0).length;
  const inRoom = new Set(rooms.flatMap((room) => room.members));
  const summary = view.listing
    ? `${online.length} online · ${live === 1 ? '1 sala ao vivo' : `${live} salas ao vivo`}`
    : 'Carregando as salas…';
  const status = STATUS_TEXT[view.status];
  const banner = status
    ? `<p class="group-status" role="status"><span class="group-status-dot ${view.status === 'waking' || view.status === 'connecting' ? 'is-waiting' : 'is-problem'}" aria-hidden="true"></span>${escape(status)}</p>`
    : '';
  const menu = view.menuOpen
    ? '<div class="popover-menu group-menu" role="menu" aria-label="Opções do grupo"><button type="button" class="menu-item danger-text" role="menuitem" data-action="leave-group">Sair do grupo</button></div>'
    : '';
  const roomList = rooms.length
    ? `<ul class="room-cards">${rooms.map((room) => renderRoomCard(room, view, canUse)).join('')}</ul>`
    : `<div class="group-empty"><strong>Nenhuma sala aberta</strong>${view.status === 'online' ? '' : '<span>As salas aparecem quando a conexão com o servidor estiver pronta.</span>'}</div>`;
  const onlineList = online.length
    ? `<ul class="online-chips">${online.map((name, index) => `<li class="online-chip">${renderOnlineAvatar(name, view.onlinePhotos[index] ?? '', index)}${escape(name)}${inRoom.has(name) ? '<small>· na sala</small>' : ''}</li>`).join('')}</ul>`
    : '<p class="group-online-empty">Ninguém com o grupo aberto agora.</p>';
  return `<section class="group-home" aria-labelledby="group-title">${banner}<header class="group-home-header"><div class="group-identity"><span class="group-badge" aria-hidden="true">${escape(groupInitials(selected.name))}</span><div><h1 id="group-title">${escape(selected.name)}</h1><p class="group-summary">${escape(summary)}</p></div></div><div class="group-header-actions"><button type="button" class="button secondary" data-action="copy-group-invite">Convidar</button><div class="menu-anchor" data-menu><button type="button" class="icon-button group-more" data-action="toggle-group-menu" data-menu-toggle aria-haspopup="menu" aria-expanded="${view.menuOpen}" aria-label="Mais opções do grupo" title="Mais opções do grupo"><span aria-hidden="true">⋯</span></button>${menu}</div></div></header><section class="group-cta" aria-label="Criar sala no grupo"><span>Começar uma sala neste grupo</span><button type="button" class="button primary" data-action="create-group-room" ${canUse ? '' : 'disabled'}>+ Criar sala</button></section><section class="group-section" aria-labelledby="live-title"><h2 id="live-title">Ao vivo agora</h2>${roomList}</section><section class="group-section" aria-labelledby="online-title"><h2 id="online-title">Online agora</h2>${onlineList}</section></section>`;
}

/** Início: the selected group's rooms, or the welcome screen without groups. */
export function renderGroupHome(view: GroupHomeView): string {
  return view.selected ? renderGroupPage(view) : renderWelcome(view);
}

export function renderAddGroupModal(
  view: Pick<GroupHomeView, 'draftName' | 'draftInvite' | 'enabled'> & {
    tab: 'join' | 'create';
  },
): string {
  const forms = groupForms('add', view, 'h3');
  const tab = (id: 'join' | 'create', label: string) =>
    `<button type="button" class="segmented-tab" role="tab" id="add-group-tab-${id}" aria-selected="${view.tab === id}" aria-controls="add-group-panel" tabindex="${view.tab === id ? '0' : '-1'}" data-action="add-group-tab" data-tab="${id}">${label}</button>`;
  return `<div class="modal-overlay"><section class="modal settings-modal add-group-modal" role="dialog" aria-modal="true" aria-labelledby="add-group-title"><div class="modal-heading"><h2 id="add-group-title">Adicionar grupo</h2><button class="icon-button" data-action="close-modal" aria-label="Fechar">${icon('close')}</button></div><div class="segmented-tabs" role="tablist" aria-label="Como adicionar">${tab('join', 'Entrar com convite')}${tab('create', 'Criar novo')}</div><div id="add-group-panel" role="tabpanel" aria-labelledby="add-group-tab-${view.tab}">${view.tab === 'join' ? forms.join : `${forms.create}`}</div></section></div>`;
}

export function renderLeaveGroupModal(group: { name: string }): string {
  return `<div class="modal-overlay"><section class="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="leave-group-title"><h2 id="leave-group-title">Sair do grupo?</h2><p class="modal-description">O grupo "${escape(group.name)}" será removido deste aplicativo. Para voltar, você vai precisar de um novo convite.</p><div class="modal-footer"><button class="button subtle" data-action="cancel-leave-group">Cancelar</button><button class="button primary" data-action="confirm-leave-group">Sair do grupo</button></div></section></div>`;
}
