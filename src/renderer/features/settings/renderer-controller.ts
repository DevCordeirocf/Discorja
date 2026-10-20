import type { AppConfig, DiscorjaAPI } from '../../../shared/protocol';
import type { StreamPreferences } from '../../../shared/quality';
import type { RoomPeers } from '../../media/rtc';
import { applyPreferences as applyQualityPreferences } from '../quality/apply-preferences';
import { readQualityControls as readQualityControlsFromForm } from '../quality/quality-controls';
import { saveSettings as saveSettingsWithOptions } from './settings-controller';

export interface SettingsState {
  api: DiscorjaAPI | undefined;
  busy: boolean;
  inRoom: boolean;
  settingUrl: string;
  role: 'host' | 'viewer' | undefined;
  preferences: StreamPreferences;
  applying: boolean;
  sessionEpoch: number;
  captureEpoch: number;
  qualityEpoch: number;
  localStream: MediaStream | null;
  peers: RoomPeers | null;
}

export interface RendererSettingsSetters {
  setBusy(value: boolean): void;
  setConfig(value: AppConfig): void;
  setSettingUrl(value: string): void;
  closeModal(): void;
  setQualityEpoch(value: number): void;
  setPreferences(value: StreamPreferences): void;
  savePreferences(value: StreamPreferences): void;
  setPendingPreferences(value: StreamPreferences | null): void;
  setApplying(value: boolean): void;
  setStatus(value: string): void;
}

interface RendererSettingsDependencies extends RendererSettingsSetters {
  getState(): SettingsState;
  document: Document;
  root: ParentNode;
  render(): void;
  notify(
    message: string,
    kind?: 'error' | 'info' | 'success',
    sticky?: boolean,
  ): void;
}

export function createRendererSettingsController(
  deps: RendererSettingsDependencies,
) {
  async function saveSettings(): Promise<void> {
    const state = deps.getState();
    await saveSettingsWithOptions({
      api: state.api,
      busy: state.busy,
      inRoom: state.inRoom,
      settingUrl: state.settingUrl,
      setBusy: deps.setBusy,
      setConfig: deps.setConfig,
      setSettingUrl: deps.setSettingUrl,
      closeModal: deps.closeModal,
      render: deps.render,
      notify: deps.notify,
    });
  }

  async function applyPreferences(next: StreamPreferences): Promise<void> {
    const state = deps.getState();
    await applyQualityPreferences(next, {
      busy: state.busy,
      applying: state.applying,
      getRoomRole: () => deps.getState().role,
      preferences: state.preferences,
      getSessionEpoch: () => deps.getState().sessionEpoch,
      getCaptureEpoch: () => deps.getState().captureEpoch,
      getQualityEpoch: () => deps.getState().qualityEpoch,
      setQualityEpoch: deps.setQualityEpoch,
      getLocalStream: () => deps.getState().localStream,
      getPeers: () => deps.getState().peers,
      setPreferences: deps.setPreferences,
      savePreferences: () => deps.savePreferences(deps.getState().preferences),
      setPendingPreferences: deps.setPendingPreferences,
      setApplying: deps.setApplying,
      setStatus: deps.setStatus,
      render: deps.render,
      notify: (message, kind) => deps.notify(message, kind),
    });
  }

  function readQualityControls(
    bitrateChanged = false,
    prefix = '',
  ): StreamPreferences {
    return readQualityControlsFromForm(
      deps.document,
      deps.root,
      deps.getState().preferences,
      bitrateChanged,
      prefix,
    );
  }

  return { saveSettings, applyPreferences, readQualityControls };
}
