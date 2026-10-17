import { describe, expect, it } from 'vitest';
import { AdaptiveQuality, resolutionScale } from '../src/renderer/adaptation';
import {
  captureConstraints,
  DEFAULT_STREAM_PREFERENCES,
  normalizePreferences,
  QUALITY_PRESETS,
} from '../src/shared/quality';

describe('preferências e limites de qualidade', () => {
  it('permite teto de vídeo personalizado sem ultrapassar o upload disponível', () => {
    const preference = normalizePreferences({
      preset: '1080p60',
      videoBitrateMbps: 24,
      maxUploadMbps: 80,
    });
    const controller = new AdaptiveQuality(preference);
    expect(controller.target(50_000_000).bitrate).toBe(24_000_000);
    expect(controller.target(7_000_000).bitrate).toBe(7_000_000);
    expect(
      normalizePreferences({ videoBitrateMbps: 200 }).videoBitrateMbps,
    ).toBe(100);
    expect(
      normalizePreferences({ videoBitrateMbps: 0.1 }).videoBitrateMbps,
    ).toBe(1);
    for (const invalid of [0, -1, NaN, Infinity, '24'])
      expect(
        normalizePreferences({ videoBitrateMbps: invalid }).videoBitrateMbps,
      ).toBeUndefined();
    controller.configure({ ...preference, videoBitrateMbps: undefined });
    expect(controller.target(50_000_000).bitrate).toBe(12_000_000);
  });
  it('valida preferências persistidas e limita o orçamento de upload', () => {
    expect(normalizePreferences(null)).toEqual(DEFAULT_STREAM_PREFERENCES);
    expect(
      normalizePreferences({
        preset: '__proto__',
        content: 'invalid',
        adaptive: 'yes',
        maxUploadMbps: NaN,
      }),
    ).toEqual(DEFAULT_STREAM_PREFERENCES);
    expect(
      normalizePreferences({
        preset: '1080p60',
        content: 'motion',
        adaptive: false,
        maxUploadMbps: 500,
      }),
    ).toEqual({
      preset: '1080p60',
      content: 'motion',
      adaptive: false,
      maxUploadMbps: 500,
    });
    expect(normalizePreferences({ maxUploadMbps: -1 }).maxUploadMbps).toBe(4);
    expect(normalizePreferences({ maxUploadMbps: 800 }).maxUploadMbps).toBe(
      500,
    );
  });
  it('define tetos concretos de captura e bitrate para cada preset', () => {
    expect(QUALITY_PRESETS['720p30'].bitrate).toBe(4_000_000);
    expect(QUALITY_PRESETS['1080p30'].bitrate).toBe(8_000_000);
    expect(QUALITY_PRESETS['1080p60'].bitrate).toBe(12_000_000);
    expect(QUALITY_PRESETS['1080p120'].bitrate).toBe(30_000_000);
    expect(captureConstraints('1080p60')).toEqual({
      width: { ideal: 1920, max: 1920 },
      height: { ideal: 1080, max: 1080 },
      frameRate: { ideal: 60, max: 60 },
    });
    expect(captureConstraints('1080p120')).toEqual({
      width: { ideal: 1920, max: 1920 },
      height: { ideal: 1080, max: 1080 },
      frameRate: { ideal: 120, max: 120 },
    });
  });
  it('preserva proporções de fontes ultrawide, retrato e pequenas sem ampliar', () => {
    const target = { width: 1920, height: 1080 };
    expect(resolutionScale({ width: 1280, height: 720 }, target)).toBe(1);
    expect(resolutionScale({ width: 3840, height: 1080 }, target)).toBe(2);
    expect(resolutionScale({ width: 1080, height: 1920 }, target)).toBeCloseTo(
      1920 / 1080,
    );
    expect(resolutionScale({}, target)).toBeUndefined();
  });
});

describe('adaptação conservadora por espectador', () => {
  it('aguarda a estimativa inicial da conexão antes de reduzir por conta própria', () => {
    const controller = new AdaptiveQuality(DEFAULT_STREAM_PREFERENCES);
    for (let time = 0; time < 10_000; time += 2000)
      expect(controller.observe({ limitation: 'bandwidth' }, time)).toBe(false);
    expect(controller.observe({ limitation: 'bandwidth' }, 10_000)).toBe(false);
    expect(controller.observe({ limitation: 'bandwidth' }, 12_000)).toBe(false);
    expect(controller.observe({ limitation: 'bandwidth' }, 14_000)).toBe(true);
  });
  it('exige três amostras ruins e respeita cooldown entre reduções', () => {
    const controller = new AdaptiveQuality({
      ...DEFAULT_STREAM_PREFERENCES,
      preset: '1080p60',
    });
    controller.observe({}, -10_000);
    const base = controller.target(Infinity);
    expect(controller.observe({ limitation: 'cpu' }, 0)).toBe(false);
    expect(controller.observe({ limitation: 'cpu' }, 2000)).toBe(false);
    expect(controller.observe({ limitation: 'cpu' }, 4000)).toBe(true);
    expect(controller.target(Infinity).bitrate).toBeLessThan(base.bitrate);
    for (let time = 6000; time < 14000; time += 2000)
      expect(controller.observe({ limitation: 'bandwidth' }, time)).toBe(false);
    expect(controller.observe({ limitation: 'bandwidth' }, 14000)).toBe(true);
  });
  it('não trata desktop parado, bitrate baixo ou FPS baixo como falha de rede', () => {
    const controller = new AdaptiveQuality(DEFAULT_STREAM_PREFERENCES);
    controller.observe({}, -10_000);
    const base = controller.target(Infinity);
    for (let i = 0; i < 100; i++)
      controller.observe(
        { bitrateMbps: 0.001, fps: 0, limitation: 'none', rttMs: 800 },
        i * 2000,
      );
    expect(controller.target(Infinity)).toEqual(base);
  });
  it('reduz por perda sustentada e restaura lentamente após quinze amostras boas', () => {
    const controller = new AdaptiveQuality(DEFAULT_STREAM_PREFERENCES);
    controller.observe({}, -10_000);
    const base = controller.target(Infinity);
    for (let i = 0; i < 3; i++)
      controller.observe({ packetLossPercent: 10 }, i * 2000);
    expect(controller.target(Infinity).bitrate).toBeLessThan(base.bitrate);
    for (let i = 0; i < 14; i++)
      expect(
        controller.observe(
          {
            bitrateMbps: 0.1,
            fps: 0,
            limitation: 'none',
            packetLossPercent: 0,
          },
          6000 + i * 2000,
        ),
      ).toBe(false);
    expect(
      controller.observe(
        { bitrateMbps: 0.1, fps: 0, limitation: 'none', packetLossPercent: 0 },
        34000,
      ),
    ).toBe(true);
    expect(controller.target(Infinity)).toEqual(base);
  });
  it('mantém resolução para detalhe e cadência para movimento', () => {
    const detail = new AdaptiveQuality({
      ...DEFAULT_STREAM_PREFERENCES,
      preset: '1080p60',
      content: 'detail',
    });
    const motion = new AdaptiveQuality({
      ...DEFAULT_STREAM_PREFERENCES,
      preset: '1080p60',
      content: 'motion',
    });
    detail.observe({}, -10_000);
    motion.observe({}, -10_000);
    for (let i = 0; i < 3; i++) {
      detail.observe({ limitation: 'cpu' }, i * 2000);
      motion.observe({ limitation: 'cpu' }, i * 2000);
    }
    expect(detail.target(Infinity)).toMatchObject({
      width: 1920,
      height: 1080,
      fps: 40,
      degradationPreference: 'maintain-resolution',
    });
    expect(motion.target(Infinity)).toMatchObject({
      width: 1440,
      height: 810,
      fps: 60,
      degradationPreference: 'maintain-framerate',
    });
  });
  it('prioriza manter 120 FPS e reduz a resolução primeiro sob limitação', () => {
    const controller = new AdaptiveQuality({
      ...DEFAULT_STREAM_PREFERENCES,
      preset: '1080p120',
      content: 'detail',
    });
    controller.observe({}, -10_000);
    expect(controller.target(Infinity)).toMatchObject({
      width: 1920,
      height: 1080,
      fps: 120,
      bitrate: 30_000_000,
      degradationPreference: 'maintain-framerate',
    });
    for (let i = 0; i < 3; i++)
      controller.observe({ limitation: 'cpu' }, i * 2000);
    expect(controller.target(Infinity)).toMatchObject({
      width: 1440,
      height: 810,
      fps: 120,
      degradationPreference: 'maintain-framerate',
    });
  });
  it('obedece ao teto de upload inclusive no modo manual e isola controladores', () => {
    const one = new AdaptiveQuality(DEFAULT_STREAM_PREFERENCES);
    const two = new AdaptiveQuality(DEFAULT_STREAM_PREFERENCES);
    one.observe({}, -10_000);
    for (let i = 0; i < 3; i++)
      one.observe({ limitation: 'bandwidth' }, i * 2000);
    expect(one.target(Infinity).bitrate).toBeLessThan(
      two.target(Infinity).bitrate,
    );
    one.configure({ ...DEFAULT_STREAM_PREFERENCES, adaptive: false });
    for (let i = 0; i < 30; i++) one.observe({ limitation: 'cpu' }, i * 2000);
    expect(one.target(1_000_000)).toMatchObject({
      bitrate: 1_000_000,
      width: 1280,
      height: 720,
      fps: 30,
    });
  });
  it('ausência de estatísticas não restaura qualidade nem apaga dificuldades sustentadas', () => {
    const controller = new AdaptiveQuality(DEFAULT_STREAM_PREFERENCES);
    controller.observe({}, -10_000);
    for (let i = 0; i < 3; i++)
      controller.observe({ limitation: 'cpu' }, i * 2000);
    const reduced = controller.target(Infinity);
    for (let i = 0; i < 30; i++) controller.observe({}, 20000 + i * 2000);
    expect(controller.target(Infinity)).toEqual(reduced);
  });
});
