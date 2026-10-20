import type { ClientMessage, ServerMessage } from '../../../../shared/protocol';
import { errorFields, type LogEventName } from '../../../../shared/logs';
import { SignalConnection } from '../../../transport/signal';

export async function connectRoomSignal(options: {
  kind: 'create' | 'join';
  name: string;
  avatar: string;
  code: string;
  signalingUrl: string;
  epoch: number;
  isCurrent: (epoch: number) => boolean;
  onMessage: (message: ServerMessage) => void;
  onDisconnected: () => void;
  setSocket: (connection: SignalConnection) => void;
  setPending: (
    kind: 'create' | 'join',
    timer: ReturnType<typeof setTimeout>,
  ) => void;
  onTimeout: () => void;
  render: () => void;
  log: (event: LogEventName, details?: Record<string, unknown>) => void;
  onFailure: (message: string) => void;
}): Promise<void> {
  const {
    kind,
    name,
    avatar,
    code,
    signalingUrl,
    epoch,
    isCurrent,
    onMessage,
    onDisconnected,
    setSocket,
    setPending,
    onTimeout,
    render,
    log,
    onFailure,
  } = options;
  const connection = new SignalConnection(
    signalingUrl,
    (message) => {
      if (isCurrent(epoch)) onMessage(message);
    },
    (details) => {
      if (!isCurrent(epoch)) return;
      log('signal.closed', details);
      onDisconnected();
    },
  );
  setSocket(connection);
  render();
  try {
    await connection.connect();
    log('signal.connected');
    if (!isCurrent(epoch)) {
      connection.disconnect();
      return;
    }
    setPending(
      kind,
      setTimeout(() => {
        if (isCurrent(epoch)) onTimeout();
      }, 10_000),
    );
    const message: ClientMessage =
      kind === 'create'
        ? { type: 'create-room', name, avatar }
        : { type: 'join-room', name, code, avatar };
    connection.send(message);
  } catch (error) {
    log('signal.connect-failed', errorFields(error));
    if (isCurrent(epoch))
      onFailure(
        error instanceof Error
          ? error.message
          : 'Não foi possível entrar na sala.',
      );
  }
}
