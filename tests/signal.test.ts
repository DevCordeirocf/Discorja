import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SignalConnection } from '../src/renderer/signal';

class Socket {
  static OPEN = 1;
  static CLOSING = 2;
  static current: Socket;
  readyState = 0;
  onopen?: () => void;
  onclose?: (event?: {
    code: number;
    wasClean: boolean;
    reason?: string;
  }) => void;
  onerror?: () => void;
  onmessage?: (event: { data: string }) => void;
  send = vi.fn();
  constructor() {
    Socket.current = this;
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  message(data: unknown) {
    this.onmessage?.({ data: JSON.stringify(data) });
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
}
const connections: SignalConnection[] = [];
function connection() {
  const onMessage = vi.fn(),
    onDisconnect = vi.fn();
  const value = new SignalConnection(
    'ws://127.0.0.1:8787',
    onMessage,
    onDisconnect,
  );
  connections.push(value);
  return { value, onMessage, onDisconnect };
}
beforeEach(() => vi.stubGlobal('WebSocket', Socket));
afterEach(() => {
  connections.splice(0).forEach((value) => value.disconnect());
  vi.unstubAllGlobals();
});

describe('Compatibilidade da sinalização', () => {
  it('informa código, fechamento limpo e duração sem encaminhar o motivo livre recebido pela rede', async () => {
    const { value, onDisconnect } = connection();
    const connected = value.connect();
    Socket.current.open();
    Socket.current.message({ type: 'hello', protocol: 3 });
    await connected;
    Socket.current.onclose?.({
      code: 1006,
      wasClean: false,
      reason: 'private',
    });
    expect(onDisconnect).toHaveBeenCalledWith({
      code: 1006,
      clean: false,
      durationMs: expect.any(Number),
    });
    expect(JSON.stringify(onDisconnect.mock.calls)).not.toContain('private');
  });
  it('só libera a sessão depois de confirmar o protocolo e encaminha mensagens válidas', async () => {
    const { value, onMessage } = connection();
    let connected = false;
    const pending = value.connect().then(() => {
      connected = true;
    });
    const socket = Socket.current;
    socket.open();
    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({ type: 'hello', protocol: 3 }),
    );
    await Promise.resolve();
    expect(connected).toBe(false);
    socket.message({ type: 'hello', protocol: 3 });
    await pending;
    expect(connected).toBe(true);
    socket.message({ type: 'host-state', sharing: false });
    expect(onMessage).toHaveBeenCalledWith({
      type: 'host-state',
      sharing: false,
    });
  });
  it('consulta a saúde a cada cinco minutos somente enquanto uma sala está ativa', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('fetch', fetchMock);
    const { value } = connection();
    const connected = value.connect();
    const socket = Socket.current;
    socket.open();
    socket.message({ type: 'hello', protocol: 3 });
    await connected;

    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(fetchMock).not.toHaveBeenCalled();

    value.setRoomActive(true);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      new URL('http://127.0.0.1:8787/health'),
      {
        method: 'GET',
        mode: 'no-cors',
        cache: 'no-store',
        credentials: 'omit',
      },
    );

    value.setRoomActive(false);
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it('explica a incompatibilidade com servidor antigo e não tenta recuperar uma sessão inexistente', async () => {
    const { value, onDisconnect } = connection();
    const pending = value.connect();
    const rejected = expect(pending).rejects.toThrow(/Atualize o servidor/);
    Socket.current.open();
    Socket.current.message({
      type: 'error',
      code: 'INVALID_MESSAGE',
      message: 'Mensagem inválida.',
    });
    await rejected;
    expect(Socket.current.readyState).toBe(3);
    expect(onDisconnect).not.toHaveBeenCalled();
  });
});
