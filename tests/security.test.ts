import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  authorizedFrame,
  rendererFile,
  trustedAppUrl,
} from '../src/electron/security';
import { isServerMessage } from '../src/shared/validation';
import { sanitizeDiagnostics } from '../src/shared/diagnostics';

describe('Isolamento do aplicativo', () => {
  const root = path.resolve('dist/renderer');
  it('limita protocolo a arquivos locais permitidos sem streams alternativos', () => {
    expect(rendererFile(root, 'app://discorja/index.html')).toBe(
      path.join(root, 'index.html'),
    );
    for (const url of [
      'file:///C:/Windows/win.ini',
      'app://other/index.html',
      'app://user@discorja/index.html',
      'app://discorja/%2e%2e%5csecret.json',
      'app://discorja/index.html:secret',
      'app://discorja/%00.js',
      'app://discorja/assets/%2e%2e%2f%2e%2e%2fsecret.json',
      'app://discorja/%zz',
    ])
      expect(rendererFile(root, url)).toBeUndefined();
  });
  it('recusa IPC de outra janela, subframe ou página remota', () => {
    const contents = { mainFrame: { url: 'app://discorja/index.html' } };
    expect(
      authorizedFrame(
        { sender: contents, senderFrame: contents.mainFrame },
        contents,
        null,
      ),
    ).toBe(true);
    expect(
      authorizedFrame(
        { sender: {}, senderFrame: contents.mainFrame },
        contents,
        null,
      ),
    ).toBe(false);
    expect(
      authorizedFrame({ sender: contents, senderFrame: {} }, contents, null),
    ).toBe(false);
    contents.mainFrame.url = 'https://attacker.invalid/';
    expect(
      authorizedFrame(
        { sender: contents, senderFrame: contents.mainFrame },
        contents,
        null,
      ),
    ).toBe(false);
    expect(
      trustedAppUrl(
        'http://127.0.0.1:5173/index.html',
        'http://127.0.0.1:5173',
      ),
    ).toBe(true);
    expect(
      trustedAppUrl(
        'http://127.0.0.1:5173.evil.invalid/',
        'http://127.0.0.1:5173',
      ),
    ).toBe(false);
  });
  it('recusa respostas adulteradas sem tratar instaladores ou comandos como protocolo', () => {
    expect(
      isServerMessage({ type: 'viewer-joined', peerId: 'id-1', name: 'Ana' }),
    ).toBe(true);
    for (const value of [
      { type: 'update-available', url: 'https://attacker.invalid/malware.exe' },
      {
        type: 'signal',
        peerId: 'id',
        signal: { type: 'offer', sdp: 'x'.repeat(56001) },
      },
      { type: 'viewer-joined', peerId: 'id', name: 'x'.repeat(41) },
      {
        type: 'room-created',
        code: 'ABCDEFGH',
        selfId: 'id',
        maxViewers: Infinity,
      },
      { type: 'host-state', sharing: true, command: 'cmd.exe' },
      {
        type: 'signal',
        peerId: 'id',
        signal: {
          type: 'ice',
          candidate: { candidate: '', sdpMLineIndex: -1 },
        },
      },
    ])
      expect(isServerMessage(value)).toBe(false);
  });
  it('exporta somente métricas permitidas, descartando identificadores e credenciais', () => {
    const report = sanitizeDiagnostics(
      {
        token: 'secret',
        preferences: {},
        metrics: [
          {
            peerId: 'secret-id',
            name: 'secret-name',
            ip: '192.0.2.1',
            sdp: 'secret-sdp',
            candidate: 'secret-ice',
            encoderImplementation: 'secret-text',
            fps: 60,
            codec: 'video/VP8',
            route: 'direct',
            powerEfficientEncoder: false,
            framesDropped: NaN,
          },
        ],
      },
      '0.3.0',
    );
    expect(report.streams[0]).toMatchObject({
      stream: 1,
      fps: 60,
      codec: 'video/VP8',
      powerEfficientEncoder: false,
    });
    expect(JSON.stringify(report)).not.toMatch(/secret|192\.0\.2/);
    expect(() =>
      sanitizeDiagnostics({ metrics: new Array(101) }, '0.3.0'),
    ).toThrow();
  });
});
