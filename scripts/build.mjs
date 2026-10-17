import { build } from 'esbuild';
import { build as buildRenderer } from 'vite';
import { mkdir, copyFile, writeFile, access } from 'node:fs/promises';

await import('./generate-icon.mjs');
await mkdir('dist/electron', { recursive: true });
await Promise.all([
  copyFile('build/icon.ico', 'dist/electron/icon.ico'),
  copyFile('build/icon.png', 'dist/electron/icon.png'),
]);
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
await mkdir('dist/renderer/assets', { recursive: true });
await copyFile(
  'src/renderer/assets/fonts/OFL.txt',
  'dist/renderer/assets/Roboto-OFL.txt',
);
try {
  await access('build/release.json');
  await copyFile('build/release.json', 'dist/electron/release.json');
} catch {
  await writeFile('dist/electron/release.json', 'null\n');
}
