import { describe, expect, it } from 'vitest';
import { decodeBase64Prefix, sniffImage } from '../src/shared/image-magic';
import { profileAvatar } from '../src/shared/validation';

export function gifDataUrl(width: number, height: number, padding = 30) {
  const bytes = new Uint8Array(12 + padding);
  bytes.set([...'GIF89a'].map((char) => char.charCodeAt(0)));
  bytes.set([width & 255, width >> 8, height & 255, height >> 8], 6);
  return `data:image/gif;base64,${Buffer.from(bytes).toString('base64')}`;
}

describe('identificação de imagens pelos bytes', () => {
  it('reconhece JPEG, PNG, GIF e WebP com dimensões', () => {
    expect(sniffImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toEqual({
      type: 'jpeg',
    });
    const png = new Uint8Array(24);
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    png.set([0, 0, 1, 0, 0, 0, 0, 64], 16);
    expect(sniffImage(png)).toEqual({ type: 'png', width: 256, height: 64 });
    const gif = decodeBase64Prefix(gifDataUrl(120, 90).split(',')[1]);
    expect(sniffImage(gif)).toEqual({ type: 'gif', width: 120, height: 90 });
    const webp = new Uint8Array(30);
    webp.set([...'RIFF'].map((char) => char.charCodeAt(0)));
    webp.set(
      [...'WEBPVP8X'].map((char) => char.charCodeAt(0)),
      8,
    );
    webp.set([127, 0, 0, 63, 0, 0], 24);
    expect(sniffImage(webp)).toEqual({ type: 'webp', width: 128, height: 64 });
    expect(sniffImage(new Uint8Array([0, 0, 0, 24]))).toBeNull();
  });

  it('aceita avatares cujo conteúdo confere com o tipo declarado', () => {
    expect(profileAvatar('')).toBe(true);
    expect(profileAvatar(gifDataUrl(128, 128))).toBe(true);
    expect(profileAvatar(gifDataUrl(300, 300))).toBe(false);
    expect(
      profileAvatar(gifDataUrl(64, 64).replace('image/gif', 'image/jpeg')),
    ).toBe(false);
    expect(profileAvatar('data:image/png;base64,AAAA')).toBe(false);
    expect(profileAvatar(`data:image/gif;base64,${'A'.repeat(98_400)}`)).toBe(
      false,
    );
  });
});
