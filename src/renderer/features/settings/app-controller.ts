import type { AppConfig } from '../../../shared/protocol';
import type { StreamPreferences } from '../../../shared/quality';
import type { SettingsState } from './renderer-controller';
import { createRendererSettingsController } from './renderer-controller';

export interface SettingsAppSetters {
  busy(value: boolean): void;
  config(value: AppConfig): void;
  settingUrl(value: string): void;
  closeModal(): void;
  qualityEpoch(value: number): void;
  preferences(value: StreamPreferences): void;
  savePreferences(value: StreamPreferences): void;
  pendingPreferences(value: StreamPreferences | null): void;
  applying(value: boolean): void;
  status(value: string): void;
}

export function createAppSettingsController(deps: {
  getState(): SettingsState;
  setters: SettingsAppSetters;
  document: Document;
  root: ParentNode;
  render(): void;
  notify(
    message: string,
    kind?: 'error' | 'info' | 'success',
    sticky?: boolean,
  ): void;
}) {
  return createRendererSettingsController({
    getState: deps.getState,
    setBusy: deps.setters.busy,
    setConfig: deps.setters.config,
    setSettingUrl: deps.setters.settingUrl,
    closeModal: deps.setters.closeModal,
    setQualityEpoch: deps.setters.qualityEpoch,
    setPreferences: deps.setters.preferences,
    savePreferences: deps.setters.savePreferences,
    setPendingPreferences: deps.setters.pendingPreferences,
    setApplying: deps.setters.applying,
    setStatus: deps.setters.status,
    document: deps.document,
    root: deps.root,
    render: deps.render,
    notify: deps.notify,
  });
}
