import { WebSocket } from 'ws';
import { validateSignalingUrl } from '../electron/config.js';
import { ROOM_PROTOCOL_VERSION } from '../shared/protocol.js';

export interface ServiceCheck {
  ok: boolean;
  health: boolean;
  protocol: boolean;
  stats: 'not-requested' | 'available' | 'disabled' | 'unauthorized' | 'failed';
  notes: string[];
}

/** No room creation, capture, TLS bypass, redirects or secret values in output. */
export async function checkService(
  endpoint: string,
  statsToken?: string,
  timeoutMs = 5000,
): Promise<ServiceCheck> {
  const url = new URL(validateSignalingUrl(endpoint));
  if (url.search)
    throw new Error('Use um endereço sem parâmetros ou credenciais.');
  if (statsToken && !/^[\x21-\x7e]{32,256}$/.test(statsToken))
    throw new Error(
      'STATS_TOKEN inválido. Não informe o segredo pela linha de comando.',
    );
  const base = new URL(url);
  base.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  const result: ServiceCheck = {
    ok: false,
    health: false,
    protocol: false,
    stats: 'not-requested',
    notes: [],
  };
  const request = (path: string, headers?: Record<string, string>) =>
    fetch(new URL(path, base), {
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
      headers,
    });
  const json = async (response: Response): Promise<Record<string, unknown>> => {
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Empty response');
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > 16 * 1024) throw new Error('Response too large');
        chunks.push(value);
      }
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  };
  try {
    const response = await request('/health');
    result.health = response.ok && (await json(response)).status === 'ok';
  } catch {
    /* Generic output deliberately excludes remote URLs and response bodies. */
  }
  if (!result.health)
    result.notes.push(
      'Falha em /health: confira endereço, TLS, processo e proxy.',
    );
  result.protocol = await new Promise<boolean>((resolve) => {
    const socket = new WebSocket(url, {
      origin: 'app://discorja',
      maxPayload: 64 * 1024,
      handshakeTimeout: timeoutMs,
      followRedirects: false,
    });
    let done = false;
    const finish = (ok: boolean) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.terminate();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    socket.once('open', () =>
      socket.send(
        JSON.stringify({ type: 'hello', protocol: ROOM_PROTOCOL_VERSION }),
      ),
    );
    socket.once('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        finish(
          message.type === 'hello' &&
            message.protocol === ROOM_PROTOCOL_VERSION,
        );
      } catch {
        finish(false);
      }
    });
    socket.once('error', () => finish(false));
    socket.once('close', () => finish(false));
  });
  if (!result.protocol)
    result.notes.push(
      'Falha no protocolo 3: confira versão do servidor, Origin e encaminhamento WebSocket.',
    );
  if (statsToken) {
    try {
      const response = await request('/api/stats', {
        Authorization: `Bearer ${statsToken}`,
      });
      result.stats =
        response.status === 404
          ? 'disabled'
          : response.status === 401
            ? 'unauthorized'
            : 'failed';
      if (response.ok) {
        const data = await json(response);
        if (
          data.schemaVersion === 1 &&
          data.scope === 'instance' &&
          Number.isInteger(data.activeRooms)
        )
          result.stats = 'available';
      }
    } catch {
      result.stats = 'failed';
    }
    if (result.stats !== 'available')
      result.notes.push(
        'Estatísticas indisponíveis: confira STATS_TOKEN somente no ambiente administrativo.',
      );
  }
  result.ok =
    result.health &&
    result.protocol &&
    (!statsToken || result.stats === 'available');
  result.notes.push(
    'Este diagnóstico não testa vídeo, áudio, STUN/TURN, atualização instalada ou segurança do host.',
  );
  return result;
}
