import type { DiscorjaAPI } from '../../../shared/protocol';

type Notify = (message: string, kind?: 'error' | 'info' | 'success') => void;

export async function downloadUpdate(
  api: DiscorjaAPI | undefined,
  notify: Notify,
): Promise<void> {
  try {
    await api?.downloadUpdate();
  } catch {
    notify('Falha ao baixar a atualização.', 'error');
  }
}

export async function checkForUpdates(
  api: DiscorjaAPI | undefined,
  notify: Notify,
): Promise<void> {
  try {
    await api?.checkUpdates();
  } catch {
    notify('Não foi possível verificar atualizações.', 'error');
  }
}

export async function installUpdate(
  api: DiscorjaAPI | undefined,
  leaveRoom: () => void,
  notify: Notify,
): Promise<void> {
  leaveRoom();
  if (!api) return;
  try {
    await api.setSharing(false);
    await api.installUpdate();
  } catch {
    notify('Não foi possível instalar a atualização.', 'error');
  }
}
