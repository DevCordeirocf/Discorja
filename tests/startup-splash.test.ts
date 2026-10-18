import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('áudio de inicialização', () => {
  it('espera a janela ficar visível e toca mesmo após o tempo da animação', async () => {
    let listeners: Record<string, () => void> = {};
    const play = vi.fn(() => Promise.resolve());
    const remove = vi.fn();
    const audio = {
      src: '',
      preload: '',
      volume: 0,
      addEventListener: vi.fn((event: string, listener: () => void) => {
        listeners[event] = listener;
      }),
      play,
      remove,
    };
    let onForeground!: (visible: boolean) => void;
    let resolveForeground!: (visible: boolean) => void;
    let elapsed = 100;
    vi.spyOn(performance, 'now').mockImplementation(() => elapsed);
    vi.stubGlobal('document', {
      querySelector: () => ({}),
      createElement: () => audio,
    });
    vi.stubGlobal('window', {
      discorja: {
        onForeground: vi.fn(),
        getForeground: vi.fn(
          () =>
            new Promise<boolean>((resolve) => {
              resolveForeground = resolve;
            }),
        ),
        recordLog: vi.fn(() => Promise.resolve()),
      },
    });
    vi.mocked(window.discorja!.onForeground).mockImplementation((callback) => {
      onForeground = callback;
      return vi.fn();
    });

    await import('../src/renderer/startup-splash');
    expect(play).not.toHaveBeenCalled();

    elapsed = 4000;
    resolveForeground(false);
    onForeground(false);
    expect(play).not.toHaveBeenCalled();

    onForeground(true);
    await vi.waitFor(() => expect(play).toHaveBeenCalledOnce());
    await vi.waitFor(() =>
      expect(window.discorja?.recordLog).toHaveBeenCalledWith({
        event: 'renderer.audio-startup',
        details: { audioState: 'started' },
      }),
    );

    expect(audio.src).toContain('startup-sigh.wav');
    expect(audio.preload).toBe('auto');
    expect(audio.volume).toBe(0.8);
    expect(listeners.playing).toBeTypeOf('function');
    listeners.playing();
    expect(window.discorja?.recordLog).toHaveBeenCalledWith({
      event: 'renderer.audio-startup',
      details: { audioState: 'playing' },
    });
    listeners.ended();
    expect(remove).toHaveBeenCalledOnce();
    expect(window.discorja?.recordLog).toHaveBeenCalledWith({
      event: 'renderer.audio-startup',
      details: { audioState: 'ended' },
    });
  });
});
