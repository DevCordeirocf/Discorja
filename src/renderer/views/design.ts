// Static assets exported from the approved Figma screens; bundled by Vite.
import { escapeHtml } from '../ui/components/html';
import { icon } from '../ui/components/icons';
export const logoUrl = new URL('../assets/logo.png', import.meta.url).href;
const assets = {
  home: new URL('../assets/icons/9a4bf.svg', import.meta.url).href,
  homeActive: new URL('../assets/icons/3a1b0.svg', import.meta.url).href,
  users: new URL('../assets/icons/1365b.svg', import.meta.url).href,
  usersActive: new URL('../assets/icons/27adb.svg', import.meta.url).href,
  settings: new URL('../assets/icons/27bb8.svg', import.meta.url).href,
  settingsActive: new URL('../assets/icons/6f330.svg', import.meta.url).href,
  collapse: new URL('../assets/icons/d53a1.svg', import.meta.url).href,
  network: new URL('../assets/icons/ff712.svg', import.meta.url).href,
  expand: new URL('../assets/icons/db898.svg', import.meta.url).href,
  screenInactive: new URL('../assets/icons/154ee.svg', import.meta.url).href,
};

export function designIcon(name: keyof typeof assets): string {
  const size = name.startsWith('screen') ? 20 : 22;
  return `<img class="design-icon" src="${assets[name]}" width="${size}" height="${size}" alt="" aria-hidden="true">`;
}

export type AppPage = 'home' | 'room' | 'settings';

export interface RailGroup {
  secret: string;
  name: string;
  initials: string;
  selected: boolean;
  live: boolean;
}

/** The single side bar: logo, the room in use, the groups and the profile menu. */
export function renderSidebar(options: {
  page: AppPage;
  hasRoom: boolean;
  groups: RailGroup[];
  canAddGroup: boolean;
  displayName: string;
  profilePhoto: string;
  version: string;
  profileMenuOpen: boolean;
}): string {
  const { page } = options;
  const name = options.displayName.trim();
  const avatar = options.profilePhoto
    ? `<img src="${escapeHtml(options.profilePhoto)}" alt="">`
    : escapeHtml(name.charAt(0).toLocaleUpperCase('pt-BR') || '?');
  const room = options.hasRoom
    ? `<button type="button" class="rail-button rail-room ${page === 'room' ? 'active' : ''}" data-action="room" aria-label="Voltar para a sala" title="Voltar para a sala" ${page === 'room' ? 'aria-current="page"' : ''}>${icon('screen')}</button>`
    : '';
  const groups = options.groups
    .map((group) => {
      const current = group.selected && page === 'home';
      const label = `${group.name}${group.live ? ', com tela ao vivo' : ''}`;
      return `<button type="button" class="rail-button ${current ? 'active' : ''}" data-action="select-group" data-group="${escapeHtml(group.secret)}" aria-label="${escapeHtml(label)}" title="${escapeHtml(group.name)}" ${current ? 'aria-current="page"' : ''}>${escapeHtml(group.initials)}${group.live ? '<span class="rail-live" aria-hidden="true"></span>' : ''}</button>`;
    })
    .join('');
  const add = options.canAddGroup
    ? `<button type="button" class="rail-button rail-add" data-action="add-group" aria-label="Criar ou entrar em um grupo" title="Criar ou entrar em um grupo">${icon('plus')}</button>`
    : '';
  const profileLabel = `Perfil de ${name || 'você'}`;
  const menu = options.profileMenuOpen
    ? `<div class="popover-menu profile-menu" role="menu" aria-label="Seu perfil"><div class="profile-menu-head"><span class="avatar">${avatar}</span><span class="profile-menu-copy"><strong>${escapeHtml(name || 'Seu nome')}</strong><small>${escapeHtml(/^\d/u.test(options.version) ? `v${options.version}` : options.version)}</small></span></div><button type="button" class="menu-item" role="menuitem" data-action="edit-name">${icon('edit')}Editar perfil</button><button type="button" class="menu-item" role="menuitem" data-action="settings">${icon('settings')}Configurações</button></div>`
    : '';
  return `<aside class="rail"><img class="rail-logo" src="${logoUrl}" alt="Discorja" width="44" height="44"><span class="rail-divider" aria-hidden="true"></span><nav id="main-navigation" class="rail-nav" aria-label="Seus grupos">${room}${groups}${add}</nav><div class="rail-bottom" data-menu><span class="rail-divider" aria-hidden="true"></span><button type="button" class="rail-profile ${options.profileMenuOpen || page === 'settings' ? 'active' : ''}" data-action="toggle-profile-menu" data-menu-toggle aria-haspopup="menu" aria-expanded="${options.profileMenuOpen}" aria-label="${escapeHtml(profileLabel)}" title="${escapeHtml(profileLabel)}"><span class="avatar">${avatar}</span></button>${menu}</div></aside>`;
}
