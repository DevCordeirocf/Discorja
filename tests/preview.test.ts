import { describe, expect, it, vi } from 'vitest';
import { syncLocalPreview } from '../src/renderer/preview';

describe('Prévia local em segundo plano', () => {
  it('solta o player em segundo plano sem modificar ou encerrar a captura', () => {
    const stop = vi.fn(),
      applyConstraints = vi.fn();
    const track = { readyState: 'live', enabled: true, stop, applyConstraints };
    const stream = { getTracks: () => [track] } as unknown as MediaStream;
    const element = {
      srcObject: stream,
      paused: false,
      muted: false,
      dataset: {},
      pause: vi.fn(),
      play: vi.fn(async () => undefined),
    };
    syncLocalPreview(element as unknown as HTMLVideoElement, stream, false);
    expect(element.pause).toHaveBeenCalledOnce();
    expect(element.srcObject).toBeNull();
    expect(element.dataset).toEqual({ previewSuspended: 'true' });
    expect(track.readyState).toBe('live');
    expect(track.enabled).toBe(true);
    expect(stop).not.toHaveBeenCalled();
    expect(applyConstraints).not.toHaveBeenCalled();
    element.paused = true;
    syncLocalPreview(element as unknown as HTMLVideoElement, stream, true);
    expect(element.srcObject).toBe(stream);
    expect(element.play).toHaveBeenCalledOnce();
    expect(element.muted).toBe(true);
    expect(element.dataset).toEqual({});
  });
});
