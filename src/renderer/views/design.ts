// Static assets exported from the approved Figma screens; bundled by Vite.
import { escapeHtml } from '../html';
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

export function renderSidebar(
  page: AppPage,
  roomActive: boolean,
  collapsed: boolean,
  name: string,
  version: string,
): string {
  const nav = (
    destination: AppPage,
    label: string,
    image: 'home' | 'users' | 'settings',
    action: string,
  ) => {
    const active = destination === page;
    return `<button class="nav-item ${active ? 'active' : ''}" data-action="${action}" aria-label="${label}" ${active ? 'aria-current="page"' : ''} title="${label}">${designIcon(active ? `${image}Active` : image)}<span class="nav-label">${label}</span></button>`;
  };
  return `<aside class="sidebar"><div class="brand"><button class="brand-logo" data-action="${collapsed ? 'toggle-sidebar' : 'home'}" aria-label="${collapsed ? 'Expandir menu' : 'Discorja · Início'}" ${collapsed ? 'aria-expanded="false" aria-controls="main-navigation"' : ''} title="${collapsed ? 'Expandir menu' : 'Início'}"><img src="${logoUrl}" alt="" width="${collapsed ? 48 : 36}" height="${collapsed ? 48 : 36}"></button><span class="brand-name">Discorja</span><button class="sidebar-toggle" data-action="toggle-sidebar" aria-label="Recolher menu" aria-expanded="true" aria-controls="main-navigation" title="Recolher menu">${designIcon('collapse')}</button></div><nav id="main-navigation" aria-label="Navegação principal">${nav('home', 'Início', 'home', 'home')}${roomActive ? nav('room', 'Sala', 'users', 'room') : ''}${nav('settings', 'Configurações', 'settings', 'settings')}</nav><div class="sidebar-bottom"><div class="version-label">v${escapeHtml(version)}</div><button class="profile-button" data-action="edit-name" aria-label="Alterar seu nome" title="Alterar seu nome"><span class="avatar">${escapeHtml(name.trim().charAt(0).toLocaleUpperCase('pt-BR') || '?')}</span><span class="profile-copy"><strong>${escapeHtml(name.trim() || 'Seu nome')}</strong><small>Você</small></span></button></div></aside>`;
}
