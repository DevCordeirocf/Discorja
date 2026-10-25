import {
  CLIENT_PROTOCOLS,
  type ClientMessage,
  type ServerMessage,
} from '../../shared/protocol';
import { healthUrl } from './server-warmup';

import { isServerMessage, MAX_MESSAGE_BYTES } from '../../shared/validation';
export { isServerMessage } from '../../shared/validation';

/** Inbound budget per socket; well above the server's own per-socket limit. */
const MAX_INBOUND_MESSAGES = 600;
const INBOUND_WINDOW_MS = 10_000;

export class SignalConnection {
  private static readonly roomHeartbeatIntervalMs = 5 * 60_000;
  private static readonly encoder = new TextEncoder();
  private socket: WebSocket | null = null;
  private intentional = false;
  private abortOpen: (() => void) | null = null;
  private messages = 0;
  private windowStarted = Date.now();
  private roomHeartbeat: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly url: string,
    private readonly onMessage: (message: ServerMessage) => void,
    private readonly onDisconnect: (details: {
      code: number;
      clean: boolean;
      durationMs: number;
    }) => void,
  ) {}

  /**
   * Opens the socket and negotiates the first protocol, in order, that the
   * server accepts. Resolves with the negotiated protocol.
   */
  connect(
    options: { timeoutMs?: number; protocols?: readonly number[] } = {},
  ): Promise<number> {
    const timeoutMs = options.timeoutMs ?? 10_000;
    const protocols = options.protocols?.length
      ? options.protocols
      : CLIENT_PROTOCOLS;
    let offered = 0;
    const startedAt = Date.now();
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
          'O servidor não respondeu a tempo. Confira o endereço em Configurações ou tente novamente.',
        );
        this.disconnect();
      }, timeoutMs);
      const incompatible = () => {
        fail(
          'O servidor de sinalização usa uma versão incompatível com este aplicativo.',
        );
        this.disconnect();
      };
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
        socket.send(
          JSON.stringify({ type: 'hello', protocol: protocols[offered] }),
        );
      };
      socket.onmessage = (event: MessageEvent<unknown>) => {
        if (Date.now() - this.windowStarted >= INBOUND_WINDOW_MS) {
          this.messages = 0;
          this.windowStarted = Date.now();
        }
        if (++this.messages > MAX_INBOUND_MESSAGES) {
          socket.close(1008, 'Limite de mensagens');
          return;
        }
        if (this.intentional) return;
        if (
          typeof event.data !== 'string' ||
          event.data.length > MAX_MESSAGE_BYTES ||
          SignalConnection.encoder.encode(event.data).byteLength >
            MAX_MESSAGE_BYTES
        ) {
          socket.close(1008, 'Mensagem inválida');
          return;
        }
        try {
          const message: unknown = JSON.parse(event.data);
          if (isServerMessage(message)) {
            if (!settled) {
              if (
                message.type === 'hello' &&
                message.protocol === protocols[offered]
              ) {
                settled = true;
                clearTimeout(timer);
                this.abortOpen = null;
                resolve(message.protocol);
              } else if (
                message.type === 'error' &&
                message.code === 'PROTOCOL_MISMATCH' &&
                offered + 1 < protocols.length
              ) {
                // Older servers reject newer protocols; offer the next one.
                socket.send(
                  JSON.stringify({
                    type: 'hello',
                    protocol: protocols[++offered],
                  }),
                );
              } else incompatible();
              return;
            }
            this.onMessage(message);
          } else socket.close(1008, 'Protocolo inválido');
        } catch {
          socket.close(1008, 'Protocolo inválido');
        }
      };
      socket.onerror = () =>
        fail(
          'Não foi possível conectar. Verifique o servidor e sua conexão com a internet.',
        );
      socket.onclose = (event) => {
        clearTimeout(timer);
        fail('A conexão com o servidor foi encerrada.');
        if (!this.intentional)
          this.onDisconnect({
            code: event?.code ?? 1006,
            clean: event?.wasClean ?? false,
            durationMs: Math.max(0, Date.now() - startedAt),
          });
      };
    });
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState !== WebSocket.OPEN)
      throw new Error('A conexão com o servidor foi perdida.');
    this.socket.send(JSON.stringify(message));
  }

  setRoomActive(active: boolean): void {
    if (!active) {
      if (this.roomHeartbeat) clearInterval(this.roomHeartbeat);
      this.roomHeartbeat = null;
      return;
    }
    if (this.roomHeartbeat || this.intentional) return;
    this.roomHeartbeat = setInterval(() => {
      if (this.socket?.readyState !== WebSocket.OPEN) return;
      try {
        void fetch(healthUrl(this.url), {
          method: 'GET',
          mode: 'no-cors',
          cache: 'no-store',
          credentials: 'omit',
        }).catch(() => undefined);
      } catch {
        // A missed keep-alive must not interrupt an otherwise active room.
      }
    }, SignalConnection.roomHeartbeatIntervalMs);
  }

  disconnect(): void {
    this.intentional = true;
    this.setRoomActive(false);
    this.abortOpen?.();
    this.abortOpen = null;
    if (this.socket && this.socket.readyState < WebSocket.CLOSING)
      this.socket.close();
    this.socket = null;
  }
}
