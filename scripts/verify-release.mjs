import { readFile } from 'node:fs/promises';
import { verifyRelease } from './release-artifacts.mjs';

try {
  const { version } = JSON.parse(await readFile('package.json', 'utf8'));
  console.log(JSON.stringify(await verifyRelease('release', version), null, 2));
} catch (error) {
  console.error('Verificação dos artefatos falhou:', error.message);
  process.exitCode = 1;
}
