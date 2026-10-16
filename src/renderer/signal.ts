import {
  ROOM_PROTOCOL_VERSION,
  type ClientMessage,
  type ServerMessage,
} from '../shared/protocol';

import { isServerMessage, MAX_MESSAGE_BYTES } from '../shared/validation';
export { isServerMessage } from '../shared/validation';

export class SignalConnection {
  private socket: WebSocket | null = null;
  private intentional = false;
  private abortOpen: (() => void) | null = null;
  private messages = 0;
  private windowStarted = Date.now();

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
          'O servidor não confirmou o protocolo de salas. Atualize o servidor para a versão 0.7.0 ou confira seu endereço.',
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
        socket.send(
          JSON.stringify({ type: 'hello', protocol: ROOM_PROTOCOL_VERSION }),
        );
      };
      socket.onmessage = (event: MessageEvent<unknown>) => {
        if (Date.now() - this.windowStarted >= 10_000) {
          this.messages = 0;
          this.windowStarted = Date.now();
        }
        if (++this.messages > 200) {
          socket.close(1008, 'Limite de mensagens');
          return;
        }
        if (this.intentional) return;
        if (
          typeof event.data !== 'string' ||
          event.data.length > MAX_MESSAGE_BYTES ||
          new TextEncoder().encode(event.data).byteLength > MAX_MESSAGE_BYTES
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
                message.protocol === ROOM_PROTOCOL_VERSION
              ) {
                settled = true;
                clearTimeout(timer);
                this.abortOpen = null;
                resolve();
              } else {
                fail(
                  'Aplicativo e servidor usam versões incompatíveis. Atualize o servidor para 0.7.0 e use clientes compatíveis.',
                );
                this.disconnect();
              }
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
