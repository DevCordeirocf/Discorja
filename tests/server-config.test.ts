import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { resolveSignalingConfig } from '../src/server/config';

describe('configuração do servidor de sinalização', () => {
  it('aplica padrões coerentes com salas para dez participantes', () => {
    const config = resolveSignalingConfig();

    expect(config.maxViewers).toBe(9);
    expect(config.maxPublishers).toBe(10);
    expect(config.maxViewers + 1).toBe(10);
    expect(config.origins).toContain('app://discorja');
    expect(config.heartbeatMs).toBe(30_000);
    expect(config.cleanupMs).toBe(10_000);
  });

  it('valida os limites de espectadores, publicadores, reconexão e salas', () => {
    expect(() => resolveSignalingConfig({ maxViewers: 10 })).toThrow(
      'maxViewers deve ser no máximo 9.',
    );
    expect(() => resolveSignalingConfig({ maxPublishers: 11 })).toThrow(
      'maxPublishers deve ser no máximo 10',
    );
    expect(() => resolveSignalingConfig({ resumeGraceMs: 60_001 })).toThrow(
      'resumeGraceMs inválido.',
    );
    expect(() => resolveSignalingConfig({ maxRooms: 0 })).toThrow(
      'maxRooms precisa ser um inteiro positivo.',
    );
  });

  it('faz hash do token de estatísticas e valida cada janela de limite', () => {
    const statsToken = 'x'.repeat(40);
    const config = resolveSignalingConfig({
      statsToken,
      allowedOrigins: ['https://discorja.example'],
      rateLimits: { ipMessages: { max: 25, windowMs: 2_000 } },
    });

    expect(config.statsHash).toEqual(
      createHash('sha256').update(statsToken).digest(),
    );
    expect([...config.origins]).toEqual(['https://discorja.example']);
    expect(config.limits.ipMessages).toEqual({ max: 25, windowMs: 2_000 });
    expect(config.ipRetentionMs).toBe(120_000);
    expect(() =>
      resolveSignalingConfig({
        rateLimits: { socketJoins: { max: 0, windowMs: 3 } },
      }),
    ).toThrow('socketJoins.max precisa ser um inteiro positivo.');
    expect(() => resolveSignalingConfig({ statsToken: 'short' })).toThrow(
      'STATS_TOKEN precisa ter entre 32 e 256 caracteres sem espaços.',
    );
  });
});

describe('confiança no proxy', () => {
  it('aceita somente 0 ou 1 salto de proxy', () => {
    expect(resolveSignalingConfig().trustProxyHops).toBe(0);
    expect(resolveSignalingConfig({ trustProxyHops: 1 }).trustProxyHops).toBe(
      1,
    );
    expect(() => resolveSignalingConfig({ trustProxyHops: 2 })).toThrow(
      'trustProxyHops',
    );
  });

  it('deriva o limite de publicadores dos espectadores quando omitido', () => {
    expect(resolveSignalingConfig({ maxViewers: 4 }).maxPublishers).toBe(5);
  });
});
