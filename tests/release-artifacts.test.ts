import { beforeEach, afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, writeFile, unlink, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { verifyRelease } from '../scripts/release-artifacts.mjs';

let directory: string;
const version = '0.8.0',
  installer = `Discorja-Setup-${version}.exe`;
const data = Buffer.from('Synthetic installer fixture, never executable');
const digest = createHash('sha512').update(data).digest('base64');
const manifest = () => ({
  version,
  path: installer,
  sha512: digest,
  files: [{ url: installer, size: data.length, sha512: digest }],
});
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'discorja-artifacts-'));
  await writeFile(join(directory, installer), data);
  await writeFile(join(directory, installer + '.blockmap'), 'fixture');
  await writeFile(join(directory, 'latest.yml'), JSON.stringify(manifest()));
});
afterEach(async () => {
  for (const name of [
    installer,
    installer + '.blockmap',
    'latest.yml',
    'Discorja-Setup-0.7.0.exe',
  ])
    await unlink(join(directory, name)).catch(() => undefined);
  await rmdir(directory);
});
describe('Integridade da distribuição antes de enviar ao GitHub', () => {
  it('seleciona somente os artefatos da versão atual e confere tamanho/hash', async () => {
    await writeFile(join(directory, 'Discorja-Setup-0.7.0.exe'), 'old fixture');
    expect(await verifyRelease(directory, version)).toEqual({
      version,
      size: data.length,
      sha512: digest,
      files: [installer, installer + '.blockmap', 'latest.yml'],
    });
  });
  it('recusa instalador adulterado', async () => {
    await writeFile(join(directory, installer), 'tampered');
    await expect(verifyRelease(directory, version)).rejects.toThrow(
      /Integridade/,
    );
  });
  it('exige blockmap não vazio', async () => {
    await writeFile(join(directory, installer + '.blockmap'), '');
    await expect(verifyRelease(directory, version)).rejects.toThrow(/Artefato/);
  });
  it.each(['version', 'path', 'url', 'size', 'sha512'])(
    'recusa manifesto inconsistente: %s',
    async (field) => {
      const input = manifest();
      if (field === 'version') input.version = '0.7.0';
      if (field === 'path') input.path = '../outside.exe';
      if (field === 'url')
        input.files[0].url = 'https://example.invalid/installer.exe';
      if (field === 'size') input.files[0].size++;
      if (field === 'sha512') input.files[0].sha512 = 'not a checksum';
      await writeFile(join(directory, 'latest.yml'), JSON.stringify(input));
      await expect(verifyRelease(directory, version)).rejects.toThrow();
    },
  );
});
