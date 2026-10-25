import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiscorjaAPI } from '../src/shared/protocol';
import { createFilteredAudioPipeline } from '../src/renderer/media/audio-capture';

class FakeAudioContext {
  static closed = 0;
  state: 'running' | 'closed' = 'running';
  audioWorklet = { addModule: async () => undefined };
  async resume(): Promise<void> {}
  createMediaStreamDestination() {
    const track = { stop: vi.fn() };
    return {
      stream: { getAudioTracks: () => [track], getTracks: () => [track] },
    };
  }
  async close(): Promise<void> {
    this.state = 'closed';
    FakeAudioContext.closed++;
  }
}

class FakeWorkletNode {
  port = { postMessage: vi.fn() };
  connect(): void {}
  disconnect(): void {}
}

function fakeApi(start: () => Promise<number>, stop = vi.fn(async () => {})) {
  return {
    api: {
      onFilteredAudioData: () => () => undefined,
      startDiscordAudioCapture: start,
      stopDiscordAudioCapture: stop,
    } as unknown as DiscorjaAPI,
    stop,
  };
}

describe('captura de áudio filtrado', () => {
  beforeEach(() => {
    FakeAudioContext.closed = 0;
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('AudioWorkletNode', FakeWorkletNode);
    vi.stubGlobal('window', { location: { href: 'app://discorja/' } });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('encerra o processo nativo quando o descarte acontece durante o início', async () => {
    let finishStart!: (id: number) => void;
    const { api, stop } = fakeApi(
      () => new Promise<number>((resolve) => (finishStart = resolve)),
    );
    const pipeline = await createFilteredAudioPipeline(api);
    const starting = pipeline.start();
    const disposing = pipeline.dispose();
    finishStart(42);
    await expect(starting).rejects.toThrow('cancelada');
    await disposing;
    expect(stop).toHaveBeenCalledTimes(1);
    expect(FakeAudioContext.closed).toBe(1);
  });

  it('fecha o contexto de áudio mesmo quando parar o processo falha', async () => {
    const { api } = fakeApi(
      async () => 7,
      vi.fn(async () => {
        throw new Error('falhou');
      }),
    );
    const pipeline = await createFilteredAudioPipeline(api);
    await pipeline.start();
    await expect(pipeline.dispose()).rejects.toThrow('falhou');
    expect(FakeAudioContext.closed).toBe(1);
  });

  it('não chama o processo nativo quando a captura nunca começou', async () => {
    const { api, stop } = fakeApi(async () => 1);
    const pipeline = await createFilteredAudioPipeline(api);
    await pipeline.dispose();
    expect(stop).not.toHaveBeenCalled();
    expect(FakeAudioContext.closed).toBe(1);
  });
});
