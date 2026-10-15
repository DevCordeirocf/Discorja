import { build } from 'esbuild';
import { build as buildRenderer } from 'vite';
import { mkdir, copyFile, writeFile, access } from 'node:fs/promises';

await mkdir('dist/electron', { recursive: true });
await Promise.all([
  build({
    entryPoints: ['src/electron/main.ts'],
    outfile: 'dist/electron/main.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron', 'electron-updater'],
  }),
  build({
    entryPoints: ['src/electron/preload.ts'],
    outfile: 'dist/electron/preload.cjs',
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node22',
    external: ['electron'],
  }),
  buildRenderer(),
]);
try {
  await access('build/release.json');
  await copyFile('build/release.json', 'dist/electron/release.json');
} catch {
  await writeFile('dist/electron/release.json', 'null\n');
}
