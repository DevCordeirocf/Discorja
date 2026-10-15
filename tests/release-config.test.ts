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
  await rm(join(directory, 'github-output'), { force: true });
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

  it('habilita atualizações do GitHub sem certificado nem publicador', async () => {
    await prepare({ GITHUB_REPOSITORY: 'example/discorja' });
    expect(
      JSON.parse(
        await readFile(join(directory, 'build', 'release.json'), 'utf8'),
      ),
    ).toEqual({ owner: 'example', repo: 'discorja' });
    const config = await readBuilderConfiguration();
    await expect(
      validateConfiguration(config, new DebugLogger()),
    ).resolves.toBeUndefined();
    expect(config.forceCodeSigning).toBe(false);
    expect(config.win?.signtoolOptions).toBeUndefined();
    expect(config.win?.verifyUpdateCodeSignature).toBe(true);
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
    { DISCORJA_PUBLISHER_NAME: 'Example Publisher' },
    { CSC_LINK: 'configuration-test-only.pfx' },
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
    'rejeita publicador sem certificado e não aceita CSC_NAME como substituto: %j',
    async (certificate) => {
      await expect(
        prepare({
          GITHUB_REPOSITORY: 'example/discorja',
          DISCORJA_PUBLISHER_NAME: 'Example Publisher',
          ...certificate,
        }),
      ).rejects.toThrow(/CSC_LINK e DISCORJA_PUBLISHER_NAME/);
      await expect(
        readFile(join(directory, 'build', 'release.json')),
      ).rejects.toMatchObject({ code: 'ENOENT' });
    },
  );

  it('rejeita certificado sem publicador em vez de desativar a verificação silenciosamente', async () => {
    await expect(
      prepare({
        GITHUB_REPOSITORY: 'example/discorja',
        CSC_LINK: 'configuration-test-only.pfx',
      }),
    ).rejects.toThrow(/CSC_LINK e DISCORJA_PUBLISHER_NAME/);
  });

  it.each([
    { label: 'sem assinatura', values: {}, expected: 'false' },
    {
      label: 'com assinatura',
      values: {
        CSC_LINK: 'test-only.pfx',
        CSC_KEY_PASSWORD: 'test-only-password',
        DISCORJA_PUBLISHER_NAME: 'Test Publisher',
      },
      expected: 'true',
    },
    {
      label: 'configuração parcial',
      values: { DISCORJA_PUBLISHER_NAME: 'Test Publisher' },
      expected: null,
    },
  ])(
    'valida o caminho real do workflow: $label',
    async ({ values, expected }) => {
      const workflow = await readFile(
        resolve('.github/workflows/release.yml'),
        'utf8',
      );
      const step = workflow.match(
        /name: Validate optional signing configuration[\s\S]*?run: \|\r?\n([\s\S]*?)(?=      - uses:)/,
      );
      if (!step)
        throw new Error('Etapa de validação de assinatura não encontrada.');
      const script = step[1].replace(/^          /gm, '');
      const output = join(directory, 'github-output');
      const validation = execFileAsync(
        'pwsh',
        ['-NoProfile', '-NonInteractive', '-Command', script],
        {
          env: releaseEnvironment({
            ...values,
            GITHUB_OUTPUT: output,
            RELEASE_TAG: 'v0.2.0',
          }),
        },
      );
      if (expected === null) {
        await expect(validation).rejects.toThrow(
          /Incomplete optional signing configuration/,
        );
      } else {
        await validation;
        expect((await readFile(output, 'utf8')).trim()).toBe(
          `signed=${expected}`,
        );
      }
    },
  );
});
