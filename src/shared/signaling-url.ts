/** Accept only TLS endpoints, or plain WebSocket on this computer for local tests. */
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
      'Use WSS para servidores públicos. WS é permitido apenas no próprio computador.',
    );
  }
  return url.toString();
}
