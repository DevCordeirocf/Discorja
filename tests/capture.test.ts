import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  CaptureAuthorization,
  displayMediaPermission,
} from '../src/electron/capture';

afterEach(() => vi.useRealTimers());

describe('Autorização de tela e som do computador', () => {
  it('autoriza uma captura com som somente após seleção explícita e uma única vez', () => {
    const grants = new CaptureAuthorization();
    expect(grants.consume(true)).toBeNull();
    grants.select('window:test', false, 'win32');
    expect(grants.consume(true)).toBeNull();
    expect(grants.consume(false)).toBeNull();
    grants.select('window:test', true, 'win32');
    expect(grants.consume(true)).toMatchObject({
      id: 'window:test',
      audio: true,
    });
    expect(grants.consume(true)).toBeNull();
  });
  it('não amplia a seleção sem som e permite somente vídeo mesmo com som autorizado', () => {
    const grants = new CaptureAuthorization();
    grants.select('screen:test', true, 'win32');
    expect(grants.consume(false)?.id).toBe('screen:test');
    grants.select('screen:test', false, 'linux');
    expect(grants.consume(false)?.audio).toBe(false);
    for (const audio of ['true', {}, 1, null])
      expect(() => grants.select('screen:test', audio, 'win32')).toThrow();
    expect(() => grants.select('screen:test', true, 'linux')).toThrow();
    expect(grants.pending()).toBe(false);
  });
  it('expira e revoga inclusive uma seleção já consumida durante consulta assíncrona', () => {
    vi.useFakeTimers();
    const grants = new CaptureAuthorization();
    grants.select('window:test', true, 'win32');
    const pick = grants.consume(true)!;
    expect(grants.current(pick)).toBe(true);
    grants.cancel();
    expect(grants.current(pick)).toBe(false);
    grants.select('window:new', true, 'win32');
    vi.advanceTimersByTime(15001);
    expect(grants.pending()).toBe(false);
    expect(grants.consume(true)).toBeNull();
  });
  it('não concede câmera ou microfone mesmo com seleção de som pendente', () => {
    expect(displayMediaPermission(true, [])).toBe(true);
    for (const mediaTypes of [
      undefined,
      null,
      ['audio'],
      ['video'],
      ['audio', 'video'],
      {},
    ])
      expect(displayMediaPermission(true, mediaTypes)).toBe(false);
    expect(displayMediaPermission(false, [])).toBe(false);
  });
});
