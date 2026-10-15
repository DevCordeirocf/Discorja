import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import type { Configuration } from 'app-builder-lib';
import { validateConfiguration } from 'app-builder-lib/out/util/config/config';
import { DebugLogger } from 'builder-util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const prepareScript = resolve('scripts/prepare-release.mjs');
const builderConfig = resolve('electron-builder.config.cjs');
let directory: string;

function releaseEnvironment(values: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  const env = { ...process.env };
  const configurationKeys = [
    'GITHUB_REPOSITORY',
    'DISCORJA_PUBLISHER_NAME',
    'CSC_LINK',
    'CSC_NAME',
    'CSC_KEY_PASSWORD',
    'WIN_CSC_LINK',
    'WIN_CSC_KEY_PASSWORD',
  ];
  for (const key of Object.keys(env)) {
    if (configurationKeys.includes(key.toUpperCase())) delete env[key];
  }
  return { ...env, ...values };
}

async function prepare(values: NodeJS.ProcessEnv = {}) {
  return execFileAsync(process.execPath, [prepareScript], {
    cwd: directory,
    env: releaseEnvironment(values),
  });
}

async function readBuilderConfiguration(): Promise<Configuration> {
  const { stdout } = await execFileAsync(
    process.execPath,
    [
      '-e',
      'console.log(JSON.stringify(require(process.argv[1])))',
      builderConfig,
    ],
    { cwd: directory, env: releaseEnvironment() },
  );
  return JSON.parse(stdout) as Configuration;
}

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'discorja-release-config-'));
});

afterEach(async () => {
  await rm(join(directory, 'build', 'release.json'), { force: true });
  await rmdir(join(directory, 'build')).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
    },
  );
  await rmdir(directory);
});

describe('Configuração de distribuição', () => {
  it('valida o build local contra o schema instalado, com atualizações desativadas', async () => {
    await prepare();
    expect(
      JSON.parse(
        await readFile(join(directory, 'build', 'release.json'), 'utf8'),
      ),
    ).toBeNull();
    const config = await readBuilderConfiguration();
    await expect(
      validateConfiguration(config, new DebugLogger()),
    ).resolves.toBeUndefined();
    expect(config.forceCodeSigning).toBe(false);
    expect(config.publish).toBeNull();
    expect(config.win?.signtoolOptions).toBeUndefined();
  });

  it('gera metadados e valida a configuração assinada com publisher no local aceito pelo schema', async () => {
    await prepare({
      GITHUB_REPOSITORY: 'example/discorja',
      DISCORJA_PUBLISHER_NAME: 'Example Publisher',
      CSC_LINK: 'configuration-test-only.pfx',
    });
    expect(
      JSON.parse(
        await readFile(join(directory, 'build', 'release.json'), 'utf8'),
      ),
    ).toEqual({
      owner: 'example',
      repo: 'discorja',
      publisherName: 'Example Publisher',
    });
    const config = await readBuilderConfiguration();
    await expect(
      validateConfiguration(config, new DebugLogger()),
    ).resolves.toBeUndefined();
    expect(config.forceCodeSigning).toBe(true);
    expect(config.win?.verifyUpdateCodeSignature).toBe(true);
    expect(config.win?.signtoolOptions?.publisherName).toBe(
      'Example Publisher',
    );
    expect(config.publish).toEqual([
      {
        provider: 'github',
        owner: 'example',
        repo: 'discorja',
        private: false,
        releaseType: 'draft',
      },
    ]);
  });

  it.each([
    { GITHUB_REPOSITORY: 'example/discorja' },
    { DISCORJA_PUBLISHER_NAME: 'Example Publisher' },
    {
      GITHUB_REPOSITORY: 'https://github.com/example/discorja',
      DISCORJA_PUBLISHER_NAME: 'Example Publisher',
    },
  ])(
    'rejeita identificação incompleta ou inválida do repositório: %j',
    async (values) => {
      await expect(prepare(values)).rejects.toThrow(
        /GITHUB_REPOSITORY=owner\/repo/,
      );
      await expect(
        readFile(join(directory, 'build', 'release.json')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it.each([{}, { CSC_NAME: 'Unsupported Windows Name' }, { CSC_LINK: '   ' }])(
    'exige CSC_LINK preenchido e não aceita CSC_NAME como substituto: %j',
    async (certificate) => {
      await expect(
        prepare({
          GITHUB_REPOSITORY: 'example/discorja',
          DISCORJA_PUBLISHER_NAME: 'Example Publisher',
          ...certificate,
        }),
      ).rejects.toThrow(/configure CSC_LINK/);
      await expect(
        readFile(join(directory, 'build', 'release.json')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );
});
