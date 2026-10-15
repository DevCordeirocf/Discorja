import type {
  ClientMessage,
  ServerMessage,
  SignalPayload,
} from '../shared/protocol';

function isSignal(value: unknown): value is SignalPayload {
  if (!value || typeof value !== 'object') return false;
  const signal = value as Record<string, unknown>;
  if (signal.type === 'offer' || signal.type === 'answer')
    return typeof signal.sdp === 'string';
  return (
    signal.type === 'ice' &&
    !!signal.candidate &&
    typeof signal.candidate === 'object' &&
    typeof (signal.candidate as Record<string, unknown>).candidate === 'string'
  );
}

export function isServerMessage(value: unknown): value is ServerMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Record<string, unknown>;
  switch (message.type) {
    case 'room-created':
      return (
        typeof message.code === 'string' &&
        typeof message.selfId === 'string' &&
        typeof message.maxViewers === 'number'
      );
    case 'room-joined':
      return (
        typeof message.code === 'string' &&
        typeof message.selfId === 'string' &&
        typeof message.hostId === 'string' &&
        typeof message.hostName === 'string' &&
        typeof message.sharing === 'boolean'
      );
    case 'viewer-joined':
      return (
        typeof message.peerId === 'string' && typeof message.name === 'string'
      );
    case 'viewer-left':
      return typeof message.peerId === 'string';
    case 'signal':
      return typeof message.peerId === 'string' && isSignal(message.signal);
    case 'host-state':
      return typeof message.sharing === 'boolean';
    case 'room-closed':
      return (
        message.reason === 'host-left' ||
        message.reason === 'host-closed' ||
        message.reason === 'expired'
      );
    case 'kicked':
      return true;
    case 'error':
      return (
        typeof message.code === 'string' && typeof message.message === 'string'
      );
    default:
      return false;
  }
}

export class SignalConnection {
  private socket: WebSocket | null = null;
  private intentional = false;
  private abortOpen: (() => void) | null = null;

  constructor(
    private readonly url: string,
    private readonly onMessage: (message: ServerMessage) => void,
    private readonly onDisconnect: () => void,
  ) {}

  connect(timeoutMs = 10_000): Promise<void> {
    return new Promise((resolve, reject) => {
      let settled = false;
      let socket: WebSocket;
      const fail = (message: string): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.abortOpen = null;
        reject(new Error(message));
      };
      const timer = setTimeout(() => {
        fail(
          'O servidor demorou para responder. Confira o endereço em Configurações.',
        );
        this.disconnect();
      }, timeoutMs);
      this.abortOpen = () => fail('Conexão cancelada.');
      try {
        socket = new WebSocket(this.url);
      } catch {
        fail(
          'Não foi possível abrir o servidor de sinalização. Confira o endereço em Configurações.',
        );
        return;
      }
      this.socket = socket;
      socket.onopen = () => {
        if (settled || this.intentional) return;
        settled = true;
        clearTimeout(timer);
        this.abortOpen = null;
        resolve();
      };
      socket.onmessage = (event: MessageEvent<unknown>) => {
        if (this.intentional || typeof event.data !== 'string') return;
        try {
          const message: unknown = JSON.parse(event.data);
          if (isServerMessage(message)) this.onMessage(message);
        } catch {
          /* Ignore frames that do not follow the signaling protocol. */
        }
      };
      socket.onerror = () =>
        fail(
          'Não foi possível conectar. Verifique o servidor e sua conexão com a internet.',
        );
      socket.onclose = () => {
        clearTimeout(timer);
        fail('A conexão com o servidor foi encerrada.');
        if (!this.intentional) this.onDisconnect();
      };
    });
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN)
      throw new Error('A conexão com o servidor foi perdida.');
    this.socket.send(JSON.stringify(message));
  }

  disconnect(): void {
    this.intentional = true;
    this.abortOpen?.();
    this.abortOpen = null;
    if (this.socket && this.socket.readyState < WebSocket.CLOSING)
      this.socket.close();
    this.socket = null;
  }
}
