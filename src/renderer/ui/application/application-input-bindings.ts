import { bindDialogKeyboardEvents } from '../actions/dialog-events';
import { bindFormEvents } from '../actions/form-events';
import {
  bindProfileCamera,
  type ProfileCameraState,
} from '../../features/profile/profile-camera';
import type { AppPage } from '../../views/design';
import type { AppModal } from '../../views/modals';
import { DISPLAY_NAME_MAX } from '../../../shared/validation';

interface ProfileDraft {
  name: string;
  photo: string;
}

export type ApplicationInputUpdate = Partial<{
  displayName: string;
  profilePhoto: string;
  profileDraft: Partial<ProfileDraft> | null;
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
  profileDraft: ProfileDraft;
  /** Unsaved changes in Configurações; they show the save bar. */
  profileDirty: boolean;
  serverDirty: boolean;
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
  saveProfilePhoto(value: string): void;
  updateRoomProfile(name: string, photo: string): void;
  render(): void;
  notify(
    message: string,
    kind: 'error' | 'success',
    autoDismiss?: boolean,
  ): void;
  requestRoomSwitch(target: { kind: 'join'; code: string }): void;
  connectRoom(kind: 'create' | 'join', code?: string): Promise<void>;
  saveSettings(): Promise<void>;
  changeQuality(isVideoBitrate: boolean, prefix?: string): void;
  cancelSources(): void;
}): { afterRender(): void; profileCamera(): ProfileCameraState } {
  const state = options.getState;
  const invalidName = (name: string, field: string): boolean => {
    if (name && name.length <= DISPLAY_NAME_MAX) return false;
    options.notify(
      `Digite seu nome com até ${DISPLAY_NAME_MAX} caracteres.`,
      'error',
    );
    options.root.querySelector<HTMLInputElement>(field)?.focus();
    return true;
  };
  /** Saves the profile draft; false when it is not ready or invalid. */
  const saveProfile = (): boolean => {
    if (camera.state().processing) {
      options.notify('Aguarde a foto terminar de carregar.', 'error');
      return false;
    }
    const draft = state().profileDraft;
    const name = draft.name.trim();
    if (invalidName(name, '#profile-name')) return false;
    options.saveDisplayName(name);
    options.saveProfilePhoto(draft.photo);
    options.updateRoomProfile(name, draft.photo);
    options.updateState({
      displayName: name,
      profilePhoto: draft.photo,
      profileDraft: null,
      editingName: false,
    });
    options.render();
    options.notify('Perfil atualizado.', 'success', true);
    return true;
  };
  bindFormEvents(options.root, {
    setDisplayName: (value) => options.updateState({ displayName: value }),
    // The save bar and the profile preview follow every keystroke.
    setProfileDraftName: (value) => {
      options.updateState({ profileDraft: { name: value } });
      options.render();
    },
    setSettingUrl: (value) => {
      options.updateState({ settingUrl: value });
      options.render();
    },
    setReceiveVolume: (value) =>
      options.updateState({ receiveVolume: value, receiveMuted: value === 0 }),
    updatePlayback: options.updatePlayback,
    render: options.render,
    submitSettings: () => {
      const { profileDirty, serverDirty } = state();
      if (profileDirty && !saveProfile()) return;
      if (serverDirty) void options.saveSettings();
    },
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

  const camera = bindProfileCamera({
    root: options.root,
    onPhoto: (photo) => {
      options.updateState({ profileDraft: { photo } });
      options.render();
    },
    onChange: options.render,
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
        .querySelector<HTMLButtonElement>('[data-action=toggle-profile-menu]')
        ?.focus(),
  });
  return { afterRender: camera.afterRender, profileCamera: camera.state };
}
