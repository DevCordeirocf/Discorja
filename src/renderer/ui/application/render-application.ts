import type { UpdateState } from '../../../shared/protocol';
import { createElement, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { AppShell } from '../../views/app-shell';
import {
  focusable,
  rememberInteraction,
  restoreInteraction,
} from '../components/accessibility';
import { dismissStartupSplash } from '../components/startup-splash';
import { pickAutoModal } from './auto-modal';

export interface ApplicationRenderState {
  page: 'home' | 'settings' | 'room';
  hasRoom: boolean;
  recovering: boolean;
  hasDesktopApi: boolean;
  notice: { text: string; kind: 'error' | 'info' | 'success' } | null;
  modal: string | null;
  busy: 'room' | 'sources' | 'capture' | 'settings' | null;
  loaded: boolean;
  update: UpdateState;
  updateDismissed: boolean;
  updatePrompted: boolean;
  whatsNewPending: boolean;
  multiRoom: boolean;
  watchingRemote: boolean;
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  roomRole: 'host' | 'viewer' | undefined;
  connectionReconnecting: boolean;
  returnFocusAction: string;
  connectionIssue: string;
  sharing: boolean;
}

const reactRoots = new WeakMap<HTMLElement, Root>();

function reactRoot(element: HTMLElement): Root {
  let root = reactRoots.get(element);
  if (!root) {
    root = createRoot(element);
    reactRoots.set(element, root);
  }
  return root;
}

export function renderApplication(options: {
  root: HTMLDivElement;
  announcements: HTMLElement;
  state: ApplicationRenderState;
  setModal(value: 'update' | 'whats-new'): void;
  setUpdatePrompted(value: boolean): void;
  setWhatsNewShown(): void;
  setDeferredRender(value: boolean): void;
  renderHome(): ReactNode;
  renderSettings(): ReactNode;
  renderRoom(): ReactNode;
  renderSidebar(): ReactNode;
  renderModal(): ReactNode;
  updatePlayback(): void;
  syncPreviews(): void;
  patchMetrics(): void;
}): void {
  const { root } = options;
  const autoModal = pickAutoModal(options.state);
  if (autoModal) {
    options.setModal(autoModal);
    if (autoModal === 'update') options.setUpdatePrompted(true);
    else options.setWhatsNewShown();
  }
  // The snapshot was taken before the automatic modal was opened.
  const state = autoModal
    ? { ...options.state, modal: autoModal }
    : options.state;
  // React keeps the room video element across renders; while it is in
  // fullscreen, renders wait so the player is left untouched.
  const video = root.querySelector<HTMLVideoElement>('#stream-video');
  const nextStream = state.multiRoom
    ? state.watchingRemote
      ? state.remoteStream
      : state.localStream
    : state.roomRole === 'host'
      ? state.localStream
      : state.remoteStream;
  if (
    video &&
    nextStream &&
    video.srcObject === nextStream &&
    document.fullscreenElement === video
  ) {
    options.setDeferredRender(true);
    options.patchMetrics();
    return;
  }
  options.setDeferredRender(false);
  const interaction = rememberInteraction(root);
  const scrollPositions = new Map(
    [...root.querySelectorAll<HTMLElement>('[data-scroll-preserve]')].map(
      (element) => [
        element.dataset.scrollPreserve!,
        [element.scrollTop, element.scrollLeft] as const,
      ],
    ),
  );
  const hadModal = !!root.querySelector('[role="dialog"]');
  const page = state.page === 'room' && !state.hasRoom ? 'home' : state.page;
  const shellProps = {
    page,
    hasDesktopApi: state.hasDesktopApi,
    notice: state.notice,
    sidebar: options.renderSidebar(),
    home: options.renderHome(),
    settings: page === 'settings' ? options.renderSettings() : null,
    room: state.hasRoom ? options.renderRoom() : null,
    modal: options.renderModal(),
  };
  // Commit synchronously: the steps below read the freshly rendered DOM.
  flushSync(() => reactRoot(root).render(createElement(AppShell, shellProps)));
  const shell = root.querySelector<HTMLElement>('.app-shell');
  if (shell)
    shell.inert =
      !!state.modal || !!document.querySelector('.participant-photo-overlay');
  options.updatePlayback();
  options.syncPreviews();
  options.patchMetrics();
  restoreInteraction(root, interaction, !!state.modal);
  if (state.modal && !document.activeElement?.closest('[role="dialog"]'))
    focusable(root.querySelector<HTMLElement>('[role="dialog"]')!)[0]?.focus();
  if (!state.modal && hadModal)
    root
      .querySelector<HTMLElement>(
        `[data-action="${state.returnFocusAction}"], [data-action="settings"]`,
      )
      ?.focus();
  for (const element of root.querySelectorAll<HTMLElement>(
    '[data-scroll-preserve]',
  )) {
    const position = scrollPositions.get(element.dataset.scrollPreserve ?? '');
    if (position) {
      element.scrollTop = position[0];
      element.scrollLeft = position[1];
    }
  }
  const message =
    state.connectionIssue && state.watchingRemote
      ? state.connectionIssue
      : (state.notice?.text ??
        (state.recovering
          ? 'Reconectando à sala.'
          : state.hasRoom
            ? `${state.sharing ? 'Você está compartilhando sua tela. ' : ''}${state.watchingRemote ? (state.connectionReconnecting ? 'Recuperando a transmissão escolhida.' : state.remoteStream ? 'Recebendo a transmissão escolhida.' : 'Conectando à transmissão escolhida.') : 'Nenhuma transmissão selecionada.'}`
            : 'Pronto para entrar ou criar uma sala.'));
  if (options.announcements.textContent !== message)
    options.announcements.textContent = message;
  dismissStartupSplash();
}
