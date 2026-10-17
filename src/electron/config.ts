export const DEFAULT_SIGNALING_URL = 'ws://127.0.0.1:8787';

export function validateSignalingUrl(value: unknown): string {
  if (typeof value !== 'string' || value.length > 2048)
    throw new Error('Informe um endereço de sinalização válido.');
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error(
      'Use wss://servidor ou ws://127.0.0.1:8787 para testes locais.',
    );
  }
  const loopback = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (
    (url.protocol !== 'wss:' && !(url.protocol === 'ws:' && loopback)) ||
    url.username ||
    url.password ||
    url.hash
  ) {
    throw new Error(
      'Use WS para servidores públicos. WS é permitido apenas no próprio computador.',
    );
  }
  return url.toString();
}

export function parseIceServers(value: string | undefined): RTCIceServer[] {
  if (!value) return [{ urls: 'stun:stun.l.google.com:19302' }];
  const input: unknown = JSON.parse(value);
  if (!Array.isArray(input) || input.length > 8)
    throw new Error(
      'DISCORJA_ICE_SERVERS deve ser uma lista com até 8 servidores.',
    );
  return input.map((entry: unknown) => {
    if (typeof entry !== 'object' || !entry)
      throw new Error('Servidor ICE inválido.');
    const { urls, username, credential } = entry as Record<string, unknown>;
    const list = typeof urls === 'string' ? [urls] : urls;
    if (
      !Array.isArray(list) ||
      !list.length ||
      list.length > 8 ||
      list.some(
        (url) =>
          typeof url !== 'string' ||
          url.length > 2048 ||
          !/^(stun|stuns|turn|turns):[^\s]+$/.test(url),
      )
    ) {
      throw new Error(
        'Informe endereços STUN/TURN válidos em DISCORJA_ICE_SERVERS.',
      );
    }
    if (
      (username !== undefined && typeof username !== 'string') ||
      (credential !== undefined && typeof credential !== 'string')
    ) {
      throw new Error('Credenciais ICE inválidas.');
    }
    return {
      urls: list as string[],
      ...(username === undefined ? {} : { username }),
      ...(credential === undefined ? {} : { credential }),
    } as RTCIceServer;
  });
}
