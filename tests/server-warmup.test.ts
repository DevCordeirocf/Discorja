import { describe, expect, it, vi } from 'vitest';
import {
  healthUrl,
  warmUpServer,
} from '../src/renderer/transport/server-warmup';

function clock() {
  let time = 0;
  return {
    now: () => time,
    sleep: async (ms: number) => {
      time += ms;
    },
  };
}

describe('aquecimento do servidor', () => {
  it('deriva o endereço de saúde do WebSocket', () => {
    expect(healthUrl('wss://exemplo.onrender.com/ws?x=1').toString()).toBe(
      'https://exemplo.onrender.com/health',
    );
    expect(healthUrl('ws://127.0.0.1:8787').toString()).toBe(
      'http://127.0.0.1:8787/health',
    );
  });

  it('conclui logo quando o servidor responde', async () => {
    const onWaking = vi.fn();
    const fetch = vi.fn(async () => new Response(null));
    await expect(
      warmUpServer('wss://exemplo.test', { fetch, onWaking, ...clock() }),
    ).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(onWaking).not.toHaveBeenCalled();
  });

  it('avisa que está acordando e tenta de novo até responder', async () => {
    const onWaking = vi.fn();
    let calls = 0;
    const fetch = vi.fn(async () => {
      if (++calls < 3) throw new TypeError('offline');
      return new Response(null);
    });
    await expect(
      warmUpServer('wss://exemplo.test', { fetch, onWaking, ...clock() }),
    ).resolves.toBe(true);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(onWaking).toHaveBeenCalledTimes(1);
  });

  it('desiste após o prazo', async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError('offline');
    });
    await expect(
      warmUpServer('wss://exemplo.test', {
        fetch,
        deadlineMs: 10_000,
        ...clock(),
      }),
    ).resolves.toBe(false);
  });
});
