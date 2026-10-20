import type { DiscorjaAPI } from '../../../shared/protocol';

type RoomControlMessage =
  | { type: 'set-publisher'; peerId: string }
  | { type: 'set-moderator'; peerId: string; enabled: boolean }
  | { type: 'kick'; peerId: string };

export function handleRoomControlAction(options: {
  action?: string;
  peerId?: string;
  enabled?: string;
  roomActive: boolean;
  send: (message: RoomControlMessage) => boolean;
}): boolean {
  if (!options.peerId) return false;
  switch (options.action) {
    case 'set-publisher':
      options.send({ type: 'set-publisher', peerId: options.peerId });
      return true;
    case 'set-moderator':
      options.send({
        type: 'set-moderator',
        peerId: options.peerId,
        enabled: options.enabled === 'true',
      });
      return true;
    case 'kick':
      if (options.roomActive)
        options.send({ type: 'kick', peerId: options.peerId });
      return true;
    default:
      return false;
  }
}

export async function copyRoomCode(
  api: DiscorjaAPI | undefined,
  code: string | undefined,
  notify: (
    message: string,
    kind?: 'error' | 'info' | 'success',
    temporary?: boolean,
  ) => void,
): Promise<void> {
  if (!api || !code) return;
  try {
    await api.copyCode(code);
    notify('Código copiado. Agora é só convidar.', 'success', true);
  } catch {
    notify(
      'Não foi possível copiar. Selecione o código para compartilhá-lo.',
      'error',
    );
  }
}

export function rejoinRoom(options: {
  role?: 'host' | 'viewer';
  code?: string;
  leaveRoom: () => void;
  setJoinCode: (code: string) => void;
  connect: (kind: 'create' | 'join') => void;
}): void {
  if (options.role !== 'viewer' || !options.code) return;
  const code = options.code;
  options.leaveRoom();
  options.setJoinCode(code);
  options.connect('join');
}
