import type { ServerMessage } from '../../../../shared/protocol';
import { errorFields, type LogEventName } from '../../../../shared/logs';
import { SignalConnection } from '../../../transport/signal';

interface SignalRecoveryOptions {
  hasRoom: () => boolean;
  getResumeToken: () => string;
  isRecovering: () => boolean;
  setRecovering: (value: boolean) => void;
  getSessionEpoch: () => number;
  isCurrentSession: (epoch: number) => boolean;
  signalingUrl: string;
  getProtocol: () => number | undefined;
  setSocket: (connection: SignalConnection) => void;
  onMessage: (message: ServerMessage) => void;
  onSocketClosed: () => void;
  sendResume: (connection: SignalConnection, token: string) => void;
  /** Multi-room peers keep their media path while the socket reconnects. */
  keepMedia: () => boolean;
  disconnectCurrentSocket: () => void;
  stopPeers: () => void;
  clearWatchMedia: () => void;
  stopRemoteMedia: () => void;
  clearMetrics: () => void;
  setConnectionReconnecting: (value: boolean) => void;
  leaveRoom: (message: string, kind: 'error', disconnect: false) => void;
  notify: (message: string) => void;
  log: (event: LogEventName, details?: Record<string, unknown>) => void;
  setResumeTimer: (timer: ReturnType<typeof setTimeout>) => void;
  setResumeDeadline: (timer: ReturnType<typeof setTimeout>) => void;
}

export function recoverSignal(options: SignalRecoveryOptions): void {
  const {
    hasRoom,
    getResumeToken,
    isRecovering,
    setRecovering,
    getSessionEpoch,
    isCurrentSession,
    signalingUrl,
    getProtocol,
    setSocket,
    onMessage,
    onSocketClosed,
    sendResume,
    keepMedia,
    disconnectCurrentSocket,
    stopPeers,
    clearWatchMedia,
    stopRemoteMedia,
    clearMetrics,
    setConnectionReconnecting,
    leaveRoom,
    notify,
    log,
    setResumeTimer,
    setResumeDeadline,
  } = options;
  if (isRecovering()) return;
  if (!hasRoom() || !getResumeToken()) {
    leaveRoom(
      'A conexão foi encerrada. Entre novamente na sala.',
      'error',
      false,
    );
    return;
  }
  setRecovering(true);
  log('signal.recovery-started');
  setConnectionReconnecting(true);
  clearMetrics();
  if (!keepMedia()) {
    stopPeers();
    clearWatchMedia();
    stopRemoteMedia();
  }
  disconnectCurrentSocket();
  const epoch = getSessionEpoch();
  let attempt = 0;
  setResumeDeadline(
    setTimeout(() => {
      if (isCurrentSession(epoch) && isRecovering()) {
        log('signal.recovery-failed', { reason: 'deadline' });
        leaveRoom(
          'Não foi possível retomar a sala. A transmissão foi encerrada.',
          'error',
          false,
        );
      }
    }, 18_000),
  );
  const retry = async () => {
    if (!isCurrentSession(epoch) || !isRecovering()) return;
    log('signal.retry', { attempt: ++attempt });
    let opened = false;
    const connection = new SignalConnection(
      signalingUrl,
      (message) => {
        if (isCurrentSession(epoch)) onMessage(message);
      },
      (details) => {
        if (!isCurrentSession(epoch)) return;
        log('signal.closed', details);
        if (!isRecovering()) onSocketClosed();
        else if (opened) setResumeTimer(setTimeout(() => void retry(), 1_000));
      },
    );
    setSocket(connection);
    try {
      const protocol = getProtocol();
      await connection.connect({
        timeoutMs: 4_000,
        ...(protocol ? { protocols: [protocol] } : {}),
      });
      opened = true;
      if (!isCurrentSession(epoch) || !isRecovering()) {
        connection.disconnect();
        return;
      }
      sendResume(connection, getResumeToken());
    } catch (error) {
      log('signal.connect-failed', errorFields(error));
      connection.disconnect();
      if (isCurrentSession(epoch) && isRecovering())
        setResumeTimer(
          setTimeout(
            () => void retry(),
            Math.min(3_000, 500 * 2 ** (attempt - 1)),
          ),
        );
    }
  };
  notify('Reconectando à sala…');
  setResumeTimer(setTimeout(() => void retry(), 500));
}
