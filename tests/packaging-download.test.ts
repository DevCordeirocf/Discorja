import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { basename, join, resolve, sep } from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const fixture = Buffer.from('Discorja packaging download fixture');
const checksum = createHash('sha256').update(fixture).digest('hex');
const artifact = 'electron-v44.7.2-win32-x64.zip';
// Allow cold Node/module startup on Windows without changing the HTTP timeout.
const childTimeout = 20000;
const testTimeout = childTimeout + 10000;
let directory: string;
let servers: Server[];

// Resolve the downloader actually used by electron-builder, not Electron's own
// newer downloader. Proxy bootstrap runs in a child to isolate its global agents.
const download = `
  const { createRequire } = require('node:module');
  const { readFileSync } = require('node:fs');
  const builderRequire = createRequire(require.resolve('app-builder-lib/package.json'));
  const options = JSON.parse(process.argv[1]);
  builderRequire('@electron/get').downloadArtifact({
    version: '44.7.2', artifactName: 'electron', platform: 'win32', arch: 'x64',
    cacheRoot: options.cacheRoot, tempDirectory: options.cacheRoot, force: true,
    mirrorOptions: { resolveAssetURL: async () => options.url },
    checksums: { '${artifact}': options.checksum },
    downloadOptions: { retry: { limit: 0 }, timeout: { request: 3000 } }
  }).then(file => process.stdout.write(readFileSync(file)))
    .catch(error => { console.error(error.message); process.exitCode = 1; });
`;

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'discorja-packaging-'));
  servers = [];
});

afterEach(async () => {
  for (const server of servers) {
    await new Promise<void>((done, reject) => {
      server.close((error) => (error ? reject(error) : done()));
      server.closeAllConnections();
    });
  }
  const target = resolve(directory);
  if (
    !target.startsWith(resolve(tmpdir()) + sep) ||
    !basename(target).startsWith('discorja-packaging-')
  )
    throw new Error('Diretório temporário fora do escopo do teste.');
  await rm(target, { recursive: true, force: true });
});

async function endpoint(requests: string[]): Promise<string> {
  const server = createServer((request, response) => {
    requests.push(request.url ?? '');
    response.writeHead(200, { 'Content-Length': fixture.length });
    response.end(fixture);
  });
  servers.push(server);
  await new Promise<void>((done, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', done);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('Porta inválida.');
  return `http://127.0.0.1:${address.port}`;
}

function environment(proxy: string, bypass: boolean): NodeJS.ProcessEnv {
  const env = { ...process.env };
  for (const key of Object.keys(env)) {
    if (
      /proxy/i.test(key) ||
      /^global_agent_/i.test(key) ||
      /^electron_(mirror|nightly_mirror|custom_|get_)/i.test(key)
    )
      delete env[key];
  }
  return {
    ...env,
    ELECTRON_GET_USE_PROXY: '1',
    GLOBAL_AGENT_HTTP_PROXY: proxy,
    GLOBAL_AGENT_NO_PROXY: bypass ? '127.0.0.1' : '',
  };
}

async function runDownload(
  proxy: string,
  bypass: boolean,
  url: string,
  expectedChecksum = checksum,
) {
  const started = Date.now();
  try {
    return await execFileAsync(
      process.execPath,
      [
        '-e',
        download,
        JSON.stringify({
          cacheRoot: directory,
          url,
          checksum: expectedChecksum,
        }),
      ],
      {
        env: environment(proxy, bypass),
        timeout: childTimeout,
        windowsHide: true,
      },
    );
  } catch (cause) {
    const failure = cause as Error & {
      code?: string | number | null;
      signal?: string | null;
      killed?: boolean;
      stderr?: string;
    };
    const reason = failure.killed
      ? `processo interrompido (limite de ${childTimeout} ms)`
      : `código ${failure.code ?? 'indisponível'}`;
    throw Object.assign(
      new Error(
        `Download de teste falhou após ${Date.now() - started} ms: ${reason}; ` +
          `sinal ${failure.signal ?? 'nenhum'}. ` +
          `Saída de erro: ${failure.stderr?.trim() || 'vazia; verifique a inicialização do processo filho.'}`,
        { cause },
      ),
      { stderr: failure.stderr, code: failure.code, signal: failure.signal },
    );
  }
}

describe('Download do empacotador com proxy atualizado', () => {
  it.each([false, true])(
    'baixa e valida o artefato com exclusão de proxy = %s',
    async (bypass) => {
      const proxyRequests: string[] = [];
      const directRequests: string[] = [];
      const proxy = await endpoint(proxyRequests);
      const direct = await endpoint(directRequests);
      const url = bypass
        ? `${direct}/${artifact}`
        : `http://artifact.invalid/${artifact}`;
      const { stdout } = await runDownload(proxy, bypass, url);
      expect(stdout).toBe(fixture.toString());
      expect(proxyRequests).toEqual(bypass ? [] : [url]);
      expect(directRequests).toEqual(bypass ? [`/${artifact}`] : []);
    },
    testTimeout,
  );

  it(
    'continua rejeitando download com checksum incorreto',
    async () => {
      const requests: string[] = [];
      const proxy = await endpoint(requests);
      await expect(
        runDownload(
          proxy,
          false,
          `http://artifact.invalid/${artifact}`,
          '0'.repeat(64),
        ),
      ).rejects.toMatchObject({ stderr: expect.stringMatching(/checksum/i) });
      expect(requests).toHaveLength(1);
    },
    testTimeout,
  );
});
