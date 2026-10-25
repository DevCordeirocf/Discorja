import type { ClientMessage, ServerMessage } from '../../../../shared/protocol';
import { errorFields, type LogEventName } from '../../../../shared/logs';
import { SignalConnection } from '../../../transport/signal';
import { warmUpServer } from '../../../transport/server-warmup';

export async function connectRoomSignal(options: {
  kind: 'create' | 'join';
  name: string;
  /** Builds the avatar once the negotiated protocol is known. */
  prepareAvatar: (protocol: number) => Promise<string>;
  code: string;
  /** Lists the new room to a group; needs protocol 5. */
  groupKey?: string;
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
  onWaking: () => void;
  /** Clears the "waking" notice once the socket is open. */
  onConnected: () => void;
  render: () => void;
  log: (event: LogEventName, details?: Record<string, unknown>) => void;
  onFailure: (message: string) => void;
}): Promise<void> {
  const {
    kind,
    name,
    prepareAvatar,
    code,
    groupKey,
    signalingUrl,
    epoch,
    isCurrent,
    onMessage,
    onDisconnected,
    setSocket,
    setPending,
    onTimeout,
    onWaking,
    onConnected,
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
    await warmUpServer(signalingUrl, {
      onWaking: () => {
        if (isCurrent(epoch)) onWaking();
      },
      isCancelled: () => !isCurrent(epoch),
    });
    if (!isCurrent(epoch)) return;
    const protocol = await connection.connect();
    log('signal.connected', { clientProtocol: protocol });
    if (isCurrent(epoch)) onConnected();
    const avatar = await prepareAvatar(protocol);
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
        ? {
            type: 'create-room',
            name,
            avatar,
            ...(code ? { code } : {}),
            ...(groupKey && protocol >= 5 ? { groupKey } : {}),
          }
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
