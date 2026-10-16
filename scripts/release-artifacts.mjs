import { createReadStream } from 'node:fs';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import yaml from 'js-yaml';

/** Read-only validation; never installs or publishes an executable. */
export async function verifyRelease(directory, version) {
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error('Versão estável inválida.');
  const root = await realpath(resolve(directory));
  const installer = `Discorja-Setup-${version}.exe`;
  const files = [installer, `${installer}.blockmap`, 'latest.yml'];
  for (const name of files) {
    const path = join(root, name),
      info = await lstat(path);
    if (
      !info.isFile() ||
      info.isSymbolicLink() ||
      info.size === 0 ||
      (await realpath(path)) !== path
    )
      throw new Error(`Artefato inválido: ${name}`);
  }
  const manifest = yaml.load(await readFile(join(root, 'latest.yml'), 'utf8'), {
    schema: yaml.JSON_SCHEMA,
  });
  if (
    !manifest ||
    manifest.version !== version ||
    manifest.path !== installer ||
    !Array.isArray(manifest.files) ||
    manifest.files.length !== 1
  )
    throw new Error('Manifesto não corresponde à versão do pacote.');
  const entry = manifest.files[0];
  if (
    entry.url !== installer ||
    !Number.isSafeInteger(entry.size) ||
    entry.size <= 0 ||
    typeof entry.sha512 !== 'string' ||
    !/^[A-Za-z0-9+/]{86}==$/.test(entry.sha512) ||
    manifest.sha512 !== entry.sha512
  )
    throw new Error('Nome, tamanho ou SHA-512 inválido no manifesto.');
  const hash = createHash('sha512');
  for await (const chunk of createReadStream(join(root, installer)))
    hash.update(chunk);
  if (
    hash.digest('base64') !== entry.sha512 ||
    (await lstat(join(root, installer))).size !== entry.size
  )
    throw new Error('Integridade do instalador não corresponde ao manifesto.');
  return { version, files, size: entry.size, sha512: entry.sha512 };
}
