import { createServer } from 'vite';
import { build } from 'esbuild';
import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import electron from 'electron';

try {
  process.loadEnvFile('.env');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
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
]);
const server = await createServer();
await server.listen();
server.printUrls();
const env = { ...process.env, DISCORJA_DEV_URL: 'http://127.0.0.1:5173' };
delete env.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, ['.', ...process.argv.slice(2)], {
  stdio: 'inherit',
  env,
  windowsHide: true,
});
let stopping = false;
async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  child.kill();
  await server.close();
  process.exit(code);
}
child.on('exit', (code) => void stop(code ?? 0));
child.on('error', (error) => {
  console.error(error);
  void stop(1);
});
process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
