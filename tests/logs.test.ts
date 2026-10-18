import { describe, expect, it } from 'vitest';
import {
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  stat,
  appendFile,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { DesktopLogs } from '../src/electron/logs';
import {
  sanitizeLogEvent,
  rendererLogEvent,
  errorFields,
} from '../src/shared/logs';

async function directory() {
  const root = path.resolve('test-results');
  await mkdir(root, { recursive: true });
  return mkdtemp(path.join(root, 'logs-'));
}

describe('Logs de suporte sem dados livres', () => {
  it('mantém o motivo e o código da queda sem exportar credenciais, payloads ou mensagens livres', () => {
    const event = sanitizeLogEvent({
      event: 'signal.closed',
      token: 'private',
      details: {
        code: 1006,
        clean: false,
        durationMs: 1200000,
        reason: 'network',
        url: 'wss://secret.invalid?token=private',
        message: 'private',
        stack: 'private',
        name: 'private',
        roomCode: 'private',
        sdp: 'private',
      },
    });
    expect(event).toEqual({
      event: 'signal.closed',
      details: {
        code: 1006,
        clean: false,
        durationMs: 1200000,
        reason: 'network',
      },
    });
    expect(JSON.stringify(event)).not.toContain('private');
    expect(sanitizeLogEvent({ event: 'private' })).toBeNull();
    expect(
      sanitizeLogEvent({
        event: 'signal.closed',
        details: {
          reason: ['expired'],
          errorName: ['Error'],
          serverCode: ['ROOM_NOT_FOUND'],
          durationMs: Infinity,
        },
      })?.details,
    ).toEqual({});
  });
  it('rejeita falsificação do ciclo do processo pelo renderer e extrai somente a posição do código', () => {
    expect(rendererLogEvent({ event: 'server.started' })).toBeNull();
    expect(rendererLogEvent({ event: 'app.exception' })).toBeNull();
    expect(rendererLogEvent({ event: 'signal.recovery-failed' })?.event).toBe(
      'signal.recovery-failed',
    );
    const error = new TypeError('Token private em wss://private');
    error.stack =
      'TypeError: private\n at C:\\Users\\private\\dist\\electron\\main.cjs:42:11';
    expect(errorFields(error)).toEqual({
      errorName: 'TypeError',
      component: 'main',
      line: 42,
      column: 11,
    });
  });
  it('registra somente estados WebRTC enumerados para diagnosticar falhas de vídeo', () => {
    expect(
      sanitizeLogEvent({
        event: 'rtc.failed',
        details: {
          connectionState: 'failed',
          iceConnectionState: 'disconnected',
          role: 'viewer',
          sdp: 'private',
          candidate: 'private',
        },
      })?.details,
    ).toEqual({
      connectionState: 'failed',
      iceConnectionState: 'disconnected',
      role: 'viewer',
    });
    expect(
      sanitizeLogEvent({
        event: 'rtc.failed',
        details: { connectionState: 'failed private', role: 'owner' },
      })?.details,
    ).toEqual({});
  });
  it('registra metadados de requisição sem aceitar valores livres', () => {
    const event = sanitizeLogEvent({
      event: 'request.received',
      details: {
        channel: 'websocket-message',
        operation: 'join-room',
        clientProtocol: 3,
        roomId: '123e4567-e89b-12d3-a456-426614174000',
        code: 'PRIVATE-CODE',
        name: 'PRIVATE-NAME',
        sdp: 'PRIVATE-SDP',
      },
    });
    expect(event?.details).toEqual({
      channel: 'websocket-message',
      operation: 'join-room',
      clientProtocol: 3,
      roomId: '123e4567-e89b-12d3-a456-426614174000',
    });
    expect(JSON.stringify(event)).not.toMatch(/PRIVATE/);
    expect(rendererLogEvent({ event: 'request.received' })).toBeNull();
  });
  it('permite registrar o estado do áudio de inicialização sem texto livre', () => {
    expect(
      rendererLogEvent({
        event: 'renderer.audio-startup',
        details: { audioState: 'ended', error: 'private' },
      }),
    ).toEqual({
      event: 'renderer.audio-startup',
      details: { audioState: 'ended' },
    });
    expect(
      rendererLogEvent({
        event: 'renderer.audio-startup',
        details: { audioState: 'autoplay denied' },
      })?.details,
    ).toEqual({});
  });
  it('serializa gravações, limita a três arquivos e preserva os eventos mais recentes após reabrir', async () => {
    const root = await directory();
    const logger = new DesktopLogs(root, 1024);
    for (let index = 0; index < 25; index++)
      logger.write({ event: 'signal.retry', details: { attempt: index } });
    await logger.flush();
    const names = await readdir(root);
    expect(names.sort()).toEqual([
      'discorja.1.log',
      'discorja.2.log',
      'discorja.log',
    ]);
    for (const name of names)
      expect((await stat(path.join(root, name))).size).toBeLessThanOrEqual(
        1024,
      );
    const report = await new DesktopLogs(root, 1024).snapshot();
    expect(report.records.length).toBeGreaterThan(0);
    expect(report.records.length).toBeLessThan(25);
    expect(report.records.at(-1)?.details).toEqual({ attempt: 24 });
  });
  it('limita a fila, registra descartes e mantém o arquivo fatal após uma nova execução', async () => {
    const root = await directory();
    const logger = new DesktopLogs(root);
    for (let index = 0; index < 120; index++)
      logger.write({ event: 'signal.retry', details: { attempt: index } });
    logger.fatal({
      event: 'app.exception',
      details: errorFields(new Error('private')),
    });
    const report = await logger.snapshot();
    expect(report.droppedRecords).toBe(20);
    expect(report.records).toHaveLength(101);
    expect(JSON.stringify(report)).not.toContain('private');
    const reopened = await new DesktopLogs(root).snapshot();
    expect(
      reopened.records.some((event) => event.event === 'app.exception'),
    ).toBe(true);
    expect(
      (await stat(path.join(root, 'discorja.fatal.log'))).size,
    ).toBeLessThan(2048);
  });
  it('ignora registro parcial, saneia registros antigos na exportação e limita a leitura do disco', async () => {
    const root = await directory();
    const logger = new DesktopLogs(root, 1024);
    logger.write({ event: 'signal.closed', details: { code: 1006 } });
    await logger.flush();
    const file = path.join(root, 'discorja.log');
    const record = JSON.parse((await readFile(file, 'utf8')).trim());
    record.details.token = 'private';
    await writeFile(file, JSON.stringify(record) + '\n{"partial":');
    const report = await logger.snapshot();
    expect(report.records).toHaveLength(1);
    expect(JSON.stringify(report)).not.toContain('private');
    await appendFile(file, 'x'.repeat(4096));
    await expect(logger.snapshot()).rejects.toThrow('excede o limite');
  });
  it('não derruba a chamada quando o disco falha e informa que a exportação não ficou disponível', async () => {
    const root = await directory();
    const file = path.join(root, 'blocked');
    await writeFile(file, 'fixture');
    const logger = new DesktopLogs(file);
    expect(() => logger.write({ event: 'signal.closed' })).not.toThrow();
    await logger.flush();
    await expect(logger.snapshot()).rejects.toThrow('Não foi possível gravar');
  });
});
