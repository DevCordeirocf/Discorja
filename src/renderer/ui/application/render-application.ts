import type { UpdateState } from '../../../shared/protocol';
import { QUALITY_PRESETS } from '../../../shared/quality';
import { renderAppShell } from '../../views/app-shell';
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
  applyingPreferences: boolean;
  maxPublishersReached: boolean;
  includeSystemAudio: boolean;
  systemAudioSupported: boolean;
  excludeDiscordAudio: boolean;
  returnFocusAction: string;
  connectionIssue: string;
  sharing: boolean;
  qualityPreset: keyof typeof QUALITY_PRESETS;
  qualityFps: number;
}

export function renderApplication(options: {
  root: HTMLDivElement;
  announcements: HTMLElement;
  state: ApplicationRenderState;
  setModal(value: 'update' | 'whats-new'): void;
  setUpdatePrompted(value: boolean): void;
  setWhatsNewShown(): void;
  setDeferredRender(value: boolean): void;
  renderHome(): string;
  renderSettings(): string;
  renderRoom(): string;
  renderSidebar(): string;
  renderModal(): string;
  renderDiagnosticsTrigger(): string;
  renderReceiveAudioControls(): string;
  renderAudioToggleButton(): string;
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
  const oldVideo = root.querySelector<HTMLVideoElement>('#stream-video');
  const oldPreview = root.querySelector<HTMLVideoElement>('#local-preview');
  const nextStream = state.multiRoom
    ? state.watchingRemote
      ? state.remoteStream
      : state.localStream
    : state.roomRole === 'host'
      ? state.localStream
      : state.remoteStream;
  const keepVideo =
    !!oldVideo && !!nextStream && oldVideo.srcObject === nextStream;
  if (keepVideo && document.fullscreenElement === oldVideo) {
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
  root.innerHTML = renderAppShell({
    page,
    hasDesktopApi: state.hasDesktopApi,
    notice: state.notice,
    sidebar: options.renderSidebar(),
    home: options.renderHome(),
    settings: options.renderSettings,
    room: state.hasRoom ? options.renderRoom() : '',
    modal: options.renderModal(),
  });
  const panel = root.querySelector<HTMLElement>('.broadcast-panel');
  if (panel && state.hasRoom) {
    if (!state.multiRoom) {
      panel
        .querySelector('.video-stage')
        ?.insertAdjacentHTML('beforeend', options.renderDiagnosticsTrigger());
      panel
        .querySelector('.video-stage')
        ?.insertAdjacentHTML('beforeend', options.renderReceiveAudioControls());
      panel
        .querySelector('.broadcast-controls')
        ?.insertAdjacentHTML('beforeend', options.renderAudioToggleButton());
    }
    const chooseButton = panel.querySelector<HTMLButtonElement>(
      '[data-action="choose-source"]',
    );
    if (chooseButton)
      chooseButton.disabled =
        !!state.busy ||
        state.applyingPreferences ||
        state.recovering ||
        (state.multiRoom && !state.sharing && state.maxPublishersReached);
    if (
      state.connectionReconnecting &&
      state.roomRole === 'viewer' &&
      state.remoteStream
    ) {
      const banner = document.createElement('div');
      banner.className = 'video-reconnecting';
      banner.textContent = 'Reconectando ao vídeo…';
      panel.querySelector('.video-stage')?.append(banner);
      const status = panel.querySelector<HTMLElement>('.status-pill');
      if (status?.lastChild) status.lastChild.textContent = 'RECONECTANDO';
    }
    if (!nextStream && !state.multiRoom) {
      const sourceLabel = panel.querySelector(
        '.broadcast-controls > span:first-child > span',
      );
      if (sourceLabel)
        sourceLabel.textContent =
          state.roomRole === 'host'
            ? `Perfil ${QUALITY_PRESETS[state.qualityPreset].width} × ${QUALITY_PRESETS[state.qualityPreset].height} · ${state.qualityFps} QPS · sem áudio`
            : 'Vídeo compartilhado · sem áudio';
    }
  }
  if (state.modal === 'sources') {
    const optionsElement = document.createElement('div');
    optionsElement.className = 'audio-capture-options';
    optionsElement.innerHTML = `<label><input id="include-system-audio" type="checkbox" ${state.includeSystemAudio ? 'checked' : ''} ${!state.systemAudioSupported || state.busy ? 'disabled' : ''}> Áudio do computador</label>${!state.systemAudioSupported ? '<small>Disponível no Windows.</small>' : ''}${state.includeSystemAudio ? `<label><input id="exclude-discord-audio" type="checkbox" ${state.excludeDiscordAudio ? 'checked' : ''} ${state.busy ? 'disabled' : ''}> Excluir o Discord</label>${state.excludeDiscordAudio ? '<small>Você continuará ouvindo a call.</small>' : '<p class="settings-warning">O áudio inclui o Discord e outros aplicativos.</p>'}` : ''}`;
    root.querySelector('.source-audio-slot')?.replaceWith(optionsElement);
  }
  const shell = root.querySelector<HTMLElement>('.app-shell');
  if (shell)
    shell.inert =
      !!state.modal || !!document.querySelector('.participant-photo-overlay');
  const placeholder = root.querySelector<HTMLVideoElement>('#stream-video');
  if (keepVideo && oldVideo && placeholder) placeholder.replaceWith(oldVideo);
  else if (placeholder && nextStream) {
    placeholder.srcObject = nextStream;
    void placeholder.play().catch(() => undefined);
  }
  if (!keepVideo && oldVideo) oldVideo.srcObject = null;
  const previewPlaceholder =
    root.querySelector<HTMLVideoElement>('#local-preview');
  if (
    previewPlaceholder &&
    oldPreview &&
    oldPreview.srcObject === state.localStream
  )
    previewPlaceholder.replaceWith(oldPreview);
  if (oldPreview && !root.contains(oldPreview)) {
    oldPreview.pause();
    oldPreview.srcObject = null;
  }
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
