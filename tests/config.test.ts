import { describe, expect, it } from 'vitest';
import { parseIceServers, validateSignalingUrl } from '../src/electron/config';

describe('Configuração de rede', () => {
  it('permite WSS e WS somente em loopback', () => {
    expect(validateSignalingUrl(' wss://signal.example.org/path ')).toBe(
      'wss://signal.example.org/path',
    );
    expect(validateSignalingUrl('ws://127.0.0.1:8787')).toBe(
      'ws://127.0.0.1:8787/',
    );
    for (const value of [
      'https://example.org',
      'ws://192.168.0.5:8787',
      'ws://[::1]:8787',
      'ws://localhost.evil.com',
      'wss://u:p@example.org',
      'wss://example.org/#token',
      '',
      null,
    ]) {
      expect(() => validateSignalingUrl(value)).toThrow();
    }
  });
  it('valida ICE sem aceitar protocolos ou credenciais inesperados', () => {
    expect(parseIceServers('[]')).toEqual([]);
    expect(
      parseIceServers(
        '[{"urls":["turn:relay.example.org:3478"],"username":"temporary","credential":"secret"}]',
      ),
    ).toHaveLength(1);
    for (const value of [
      '{}',
      'null',
      '[{"urls":"https://example.org"}]',
      '[{"urls":[]}]',
      '[{"urls":"turn:relay","credential":{}}]',
    ]) {
      expect(() => parseIceServers(value)).toThrow();
    }
  });
});
