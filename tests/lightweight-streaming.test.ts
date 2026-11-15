import { describe, expect, it, vi } from 'vitest';
import {
  mediaCapabilitiesProbe,
  orderCodecs,
  pickEfficientCodec,
} from '../src/renderer/media/codec-preference';
import {
  ambientEffectsAllowed,
  ambientEffectsReduced,
  syncAmbientEffects,
} from '../src/renderer/ui/media/ambient-effects';

const target = { width: 1920, height: 1080, fps: 60, bitrate: 12_000_000 };

describe('codec automático eficiente', () => {
  it('prefere H264 por hardware e mantém os demais como alternativa', async () => {
    const probe = vi.fn(async (codec: string) => codec !== 'VP9');
    const available = ['video/VP8', 'video/VP9', 'video/H264', 'video/AV1'];
    await expect(pickEfficientCodec(available, probe)).resolves.toBe('H264');
    const ordered = orderCodecs(
      available.map((mimeType) => ({ mimeType })),
      'H264',
    ).map((codec) => codec.mimeType);
    expect(ordered).toEqual([
      'video/H264',
      'video/VP8',
      'video/VP9',
      'video/AV1',
    ]);
  });

  it('cai para a ordem do navegador sem codificador eficiente ou com falha na consulta', async () => {
    const available = ['video/VP8', 'video/H264', 'video/VP9'];
    await expect(
      pickEfficientCodec(available, async () => false),
    ).resolves.toBeUndefined();
    await expect(
      pickEfficientCodec(available, async () => {
        throw new Error('sem suporte');
      }),
    ).resolves.toBeUndefined();
    // VP8 is never auto-selected and codecs not offered are not probed.
    const probe = vi.fn(async () => true);
    await expect(
      pickEfficientCodec(['video/VP8'], probe),
    ).resolves.toBeUndefined();
    expect(probe).not.toHaveBeenCalled();
  });

  it('consulta Media Capabilities para WebRTC e respeita o prazo', async () => {
    vi.useFakeTimers();
    try {
      const encodingInfo = vi.fn(async () => ({
        supported: true,
        smooth: true,
        powerEfficient: true,
      }));
      const probe = mediaCapabilitiesProbe(target, {
        encodingInfo,
      } as unknown as MediaCapabilities)!;
      await expect(probe('H264')).resolves.toBe(true);
      expect(encodingInfo).toHaveBeenCalledWith({
        type: 'webrtc',
        video: {
          contentType: 'video/H264',
          width: 1920,
          height: 1080,
          framerate: 60,
          bitrate: 12_000_000,
        },
      });
      const stuck = mediaCapabilitiesProbe(target, {
        encodingInfo: () => new Promise(() => undefined),
      } as unknown as MediaCapabilities)!;
      const pending = stuck('H264');
      await vi.advanceTimersByTimeAsync(800);
      await expect(pending).resolves.toBe(false);
      expect(mediaCapabilitiesProbe(target, undefined)).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('modo leve dos efeitos', () => {
  it('pausa efeitos enquanto transmite ou em segundo plano', () => {
    expect(ambientEffectsAllowed({ sharing: false, foreground: true })).toBe(
      true,
    );
    expect(ambientEffectsAllowed({ sharing: true, foreground: true })).toBe(
      false,
    );
    expect(ambientEffectsAllowed({ sharing: false, foreground: false })).toBe(
      false,
    );
    const element = { dataset: {} } as unknown as HTMLElement;
    syncAmbientEffects(element, false);
    expect(ambientEffectsReduced(element)).toBe(true);
    syncAmbientEffects(element, true);
    expect(element.dataset).toEqual({});
  });
});
