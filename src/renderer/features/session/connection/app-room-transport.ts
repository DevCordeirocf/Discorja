import type { SignalConnection } from '../../../transport/signal';
import type { PublicationWatcher } from '../peers/publication-watcher';

type RoomRole = 'host' | 'viewer';
type RoomMessage = Parameters<SignalConnection['send']>[0];

export function createAppRoomTransport(options: {
  getSocket: () => SignalConnection | null;
  getRoom: () => { role: RoomRole } | null;
  getWatcher: () => PublicationWatcher;
  getRemoteSharing: () => boolean;
  getRemoteStream: () => MediaStream | null;
  getRemoteTimer: () => ReturnType<typeof setTimeout> | undefined;
  setRemoteTimer: (timer: ReturnType<typeof setTimeout>) => void;
  setConnectionIssue: (issue: string) => void;
  sendFailure: () => void;
  /** While resuming, peer messages are dropped and redone after the resume. */
  isRecovering: () => boolean;
  render: () => void;
}) {
  const send = (message: RoomMessage): boolean => {
    if (options.isRecovering()) return false;
    try {
      options.getSocket()?.send(message);
      return !!options.getSocket();
    } catch {
      options.sendFailure();
      return false;
    }
  };

  const waitForVideo = (): void => {
    clearTimeout(options.getRemoteTimer());
    options.setRemoteTimer(
      setTimeout(() => {
        if (
          (options.getRoom()?.role === 'viewer' ||
            options.getWatcher().watching) &&
          options.getRemoteSharing() &&
          !options.getRemoteStream()
        ) {
          options.setConnectionIssue(
            'O vídeo não chegou. Entre novamente na sala. Algumas redes precisam de um servidor TURN configurado pelo administrador.',
          );
          options.render();
        }
      }, 20_000),
    );
  };

  return { send, waitForVideo };
}
