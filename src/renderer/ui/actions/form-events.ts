import { icon } from '../components/icons';

export interface FormEventActions {
  setDisplayName(value: string): void;
  setProfileDraftName(value: string): void;
  setSettingUrl(value: string): void;
  setReceiveVolume(value: number): boolean;
  updatePlayback(): void;
  submitSettings(): void;
  changeSystemAudio(enabled: boolean): void;
  changeExcludeAudio(enabled: boolean): void;
  changeQuality(isVideoBitrate: boolean, prefix?: string): void;
}

export function bindFormEvents(
  root: HTMLElement,
  actions: FormEventActions,
): void {
  root.addEventListener('input', (event) => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement)) return;
    if (target.id === 'display-name') actions.setDisplayName(target.value);
    if (target.id === 'profile-name') actions.setProfileDraftName(target.value);
    if (target.id === 'signaling-url') actions.setSettingUrl(target.value);
    if (target.id !== 'receive-volume') return;
    const muted = actions.setReceiveVolume(Number(target.value) / 100);
    const output = root.querySelector<HTMLOutputElement>(
      '#receive-volume-value',
    );
    if (output) output.value = `${target.value}%`;
    actions.updatePlayback();
    const muteButton = root.querySelector<HTMLButtonElement>(
      '[data-action="toggle-receive-audio"]',
    );
    if (!muteButton) return;
    const label = muted
      ? 'Ativar o áudio da transmissão'
      : 'Silenciar o áudio da transmissão';
    muteButton.setAttribute('aria-pressed', String(!muted));
    muteButton.setAttribute('aria-label', label);
    muteButton.title = label;
    muteButton.innerHTML = icon(muted ? 'volume-muted' : 'volume');
  });

  root.addEventListener('submit', (event) => {
    event.preventDefault();
    if ((event.target as HTMLElement).id === 'settings-form')
      actions.submitSettings();
  });

  root.addEventListener('change', (event) => {
    const target = event.target;
    if (
      !(target instanceof HTMLInputElement) &&
      !(target instanceof HTMLSelectElement)
    )
      return;
    if (target.id.startsWith('settings-')) {
      actions.changeQuality(
        target.id === 'settings-video-bitrate',
        'settings-',
      );
      return;
    }
    if (
      target instanceof HTMLInputElement &&
      target.id === 'include-system-audio'
    ) {
      actions.changeSystemAudio(target.checked);
      return;
    }
    if (
      target instanceof HTMLInputElement &&
      target.id === 'exclude-discord-audio'
    ) {
      actions.changeExcludeAudio(target.checked);
      return;
    }
    if (
      [
        'quality-preset',
        'fps',
        'content-mode',
        'preferred-codec',
        'adaptive-quality',
        'upload-budget',
        'video-bitrate',
      ].includes(target.id)
    )
      actions.changeQuality(target.id === 'video-bitrate');
  });
}
