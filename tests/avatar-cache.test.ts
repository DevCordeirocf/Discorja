import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createAvatarCache } from '../src/renderer/features/profile/avatar-cache';

const avatar = 'data:image/jpeg;base64,/9j/4AAQ';
const id = createHash('sha256').update(avatar).digest('hex').slice(0, 16);
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('cache de fotos de perfil', () => {
  it('busca cada foto uma vez e confere o hash antes de usar', async () => {
    const request = vi.fn();
    const onChange = vi.fn();
    const cache = createAvatarCache({
      request,
      onChange,
      reducedMotion: () => false,
    });
    expect(cache.urlFor('peer', id)).toBeUndefined();
    expect(cache.urlFor('peer', id)).toBeUndefined();
    await flush();
    expect(request).toHaveBeenCalledTimes(1);
    await cache.receive({
      peerId: 'peer',
      avatarId: id,
      avatar: 'data:image/jpeg;base64,AAAA',
    });
    expect(cache.urlFor('peer', id)).toBeUndefined();
    await cache.receive({ peerId: 'peer', avatarId: id, avatar });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(cache.urlFor('peer', id)).toMatch(/^blob:/);
    cache.clear();
  });

  it('limita pedidos simultâneos a dois', async () => {
    const request = vi.fn();
    const cache = createAvatarCache({
      request,
      onChange: () => undefined,
      reducedMotion: () => false,
    });
    for (const value of ['a', 'b', 'c']) cache.urlFor(value, value.repeat(16));
    await flush();
    expect(request).toHaveBeenCalledTimes(2);
    cache.clear();
  });

  it('ignora respostas que não foram pedidas', async () => {
    const onChange = vi.fn();
    const cache = createAvatarCache({
      request: () => undefined,
      onChange,
      reducedMotion: () => false,
    });
    await cache.receive({ peerId: 'peer', avatarId: id, avatar });
    expect(onChange).not.toHaveBeenCalled();
  });
});
