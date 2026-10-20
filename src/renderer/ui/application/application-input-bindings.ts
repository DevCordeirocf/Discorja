import { bindDialogKeyboardEvents } from '../actions/dialog-events';
import { bindFormEvents } from '../actions/form-events';
import type { AppPage } from '../../views/design';
import type { AppModal } from '../../views/modals';

export type ApplicationInputUpdate = Partial<{
  displayName: string;
  joinCode: string;
  settingUrl: string;
  receiveVolume: number;
  receiveMuted: boolean;
  editingName: boolean;
  includeSystemAudio: boolean;
  excludeDiscordAudio: boolean;
  activePage: AppPage;
  modal: AppModal;
  updateDismissed: boolean;
}>;

export interface ApplicationInputState {
  displayName: string;
  joinCode: string;
  room: { role: 'host' | 'viewer'; code: string } | null;
  systemAudioSupported: boolean;
  modal: AppModal;
  activePage: AppPage;
  previousPage: AppPage;
  busy: boolean;
  sourcePage: 'screen' | 'window';
}

export function bindApplicationInputEvents(options: {
  document: Document;
  root: HTMLElement;
  getState(): ApplicationInputState;
  updateState(patch: ApplicationInputUpdate): void;
  updatePlayback(): void;
  saveDisplayName(value: string): void;
  render(): void;
  notify(
    message: string,
    kind: 'error' | 'success',
    persistent?: boolean,
  ): void;
  requestRoomSwitch(target: { kind: 'join'; code: string }): void;
  connectRoom(kind: 'join'): Promise<void>;
  saveSettings(): Promise<void>;
  changeQuality(isVideoBitrate: boolean, prefix?: string): void;
  cancelSources(): void;
}): void {
  const state = options.getState;
  bindFormEvents(options.root, {
    setDisplayName: (value) => options.updateState({ displayName: value }),
    setJoinCode: (value) => {
      const joinCode = value
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, 8);
      options.updateState({ joinCode });
      return joinCode;
    },
    setSettingUrl: (value) => options.updateState({ settingUrl: value }),
    setReceiveVolume: (value) => {
      const muted = value === 0;
      options.updateState({ receiveVolume: value, receiveMuted: muted });
      return muted;
    },
    updatePlayback: options.updatePlayback,
    submitProfile: () => {
      const name = state().displayName.trim();
      if (!name || name.length > 32) {
        options.notify('Digite seu nome com até 32 caracteres.', 'error');
        options.root.querySelector<HTMLInputElement>('#display-name')?.focus();
        return;
      }
      options.saveDisplayName(name);
      options.updateState({ editingName: false });
      options.render();
      options.notify('Nome atualizado.', 'success', true);
    },
    submitJoin: () => {
      if (state().room)
        options.requestRoomSwitch({ kind: 'join', code: state().joinCode });
      else void options.connectRoom('join');
    },
    submitSettings: () => void options.saveSettings(),
    changeSystemAudio: (enabled) => {
      options.updateState({
        includeSystemAudio: enabled && state().systemAudioSupported,
        excludeDiscordAudio: false,
      });
      options.render();
    },
    changeExcludeAudio: (enabled) => {
      options.updateState({ excludeDiscordAudio: enabled });
      options.render();
    },
    changeQuality: options.changeQuality,
  });

  bindDialogKeyboardEvents({
    document: options.document,
    root: options.root,
    getState: () => {
      const current = state();
      return {
        modal: current.modal,
        activePage: current.activePage,
        busy: current.busy,
        sourcePage: current.sourcePage,
      };
    },
    cancelSources: options.cancelSources,
    closeSettings: () => {
      const current = state();
      options.updateState({
        activePage:
          current.previousPage === 'room' && !current.room
            ? 'home'
            : current.previousPage,
      });
      options.render();
    },
    closeModal: () => options.updateState({ modal: null }),
    dismissUpdate: () => options.updateState({ updateDismissed: true }),
    render: options.render,
    focusSettings: () =>
      options.root
        .querySelector<HTMLButtonElement>('[data-action=settings]')
        ?.focus(),
  });
}
