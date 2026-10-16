import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { createSignalingServer } from '../src/server/server';
import { checkService } from '../src/server/check';

const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  await Promise.all(cleanup.splice(0).map((close) => close()));
});
async function start(statsToken?: string) {
  const service = createSignalingServer({ statsToken });
  cleanup.push(() => service.close());
  await new Promise<void>((resolve) =>
    service.server.listen(0, '127.0.0.1', resolve),
  );
  const address = service.server.address();
  if (!address || typeof address === 'string') throw new Error('Missing port');
  return { ...service, endpoint: `ws://127.0.0.1:${address.port}` };
}
describe('Diagnóstico operacional sem criar sala', () => {
  it('verifica saúde e protocolo sem mídia ou associação a salas', async () => {
    const service = await start();
    expect(await checkService(service.endpoint)).toMatchObject({
      ok: true,
      health: true,
      protocol: true,
      stats: 'not-requested',
    });
    const health = await fetch(
      service.endpoint.replace('ws:', 'http:') + '/health',
    );
    expect(await health.json()).toEqual({ status: 'ok' });
  });
  it('verifica estatísticas sem incluir segredo ou resposta administrativa no relatório', async () => {
    const secret = 's'.repeat(64),
      service = await start(secret);
    const result = await checkService(service.endpoint, secret);
    expect(result).toMatchObject({ ok: true, stats: 'available' });
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(JSON.stringify(result)).not.toContain('activeRooms');
  });
  it('diferencia estatísticas desabilitadas de token inválido', async () => {
    const disabled = await start(),
      protectedService = await start('s'.repeat(64));
    expect(await checkService(disabled.endpoint, 'x'.repeat(64))).toMatchObject(
      { ok: false, stats: 'disabled' },
    );
    expect(
      await checkService(protectedService.endpoint, 'x'.repeat(64)),
    ).toMatchObject({ ok: false, stats: 'unauthorized' });
  });
  it('recusa protocolo antigo mesmo quando a saúde responde normalmente', async () => {
    const server = createServer((_request, response) => {
      response.setHeader('Content-Type', 'application/json');
      response.end('{"status":"ok"}');
    });
    const sockets = new WebSocketServer({ server });
    sockets.on('connection', (socket) =>
      socket.once('message', () =>
        socket.send('{"type":"hello","protocol":2}'),
      ),
    );
    cleanup.push(
      () =>
        new Promise<void>((resolve) => {
          for (const socket of sockets.clients) socket.terminate();
          sockets.close();
          server.close(() => resolve());
        }),
    );
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    const address = server.address();
    if (!address || typeof address === 'string')
      throw new Error('Missing port');
    expect(await checkService(`ws://127.0.0.1:${address.port}`)).toMatchObject({
      ok: false,
      health: true,
      protocol: false,
    });
  });
  it.each([
    'ws://192.168.0.10:8787',
    'wss://user:secret@example.org',
    'wss://example.org/?token=secret',
  ])('recusa endpoint sem TLS público ou com segredo: %s', async (url) => {
    await expect(checkService(url)).rejects.toThrow();
  });
});
