import type { AppConfig, DiscorjaAPI } from '../../../shared/protocol';

interface SettingsControllerOptions {
  api: DiscorjaAPI | undefined;
  busy: boolean;
  inRoom: boolean;
  settingUrl: string;
  setBusy: (busy: boolean) => void;
  setConfig: (config: AppConfig) => void;
  setSettingUrl: (url: string) => void;
  closeModal: () => void;
  render: () => void;
  notify: (
    text: string,
    kind?: 'error' | 'info' | 'success',
    sticky?: boolean,
  ) => void;
}

export async function saveSettings(
  options: SettingsControllerOptions,
): Promise<void> {
  const {
    api,
    busy,
    inRoom,
    settingUrl,
    setBusy,
    setConfig,
    setSettingUrl,
    closeModal,
    render,
    notify,
  } = options;
  if (!api || busy || inRoom) return;
  let url: URL;
  try {
    url = new URL(settingUrl.trim());
    const loopback = ['localhost', '127.0.0.1'].includes(url.hostname);
    if (
      !['wss:', 'ws:'].includes(url.protocol) ||
      (url.protocol === 'ws:' && !loopback) ||
      url.username ||
      url.password ||
      url.hash
    )
      throw new Error();
  } catch {
    notify(
      'Use wss:// para servidores públicos ou ws://127.0.0.1:8787 para o servidor local.',
      'error',
    );
    return;
  }
  setBusy(true);
  render();
  try {
    await api.saveConfig({ signalingUrl: url.toString() });
    const config = await api.getConfig();
    setConfig(config);
    setSettingUrl(config.signalingUrl);
    closeModal();
    notify(
      'Servidor salvo. As próximas salas usarão esse endereço.',
      'success',
      true,
    );
  } catch (error) {
    notify(
      error instanceof Error
        ? error.message
        : 'Não foi possível salvar as configurações.',
      'error',
    );
  } finally {
    setBusy(false);
    render();
  }
}
