import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const installer = fileURLToPath(
  new URL('../node_modules/electron/install.js', import.meta.url),
);
// Server-only deployments omit dev dependencies and do not need a desktop runtime.
if (
  process.env.ELECTRON_SKIP_BINARY_DOWNLOAD !== '1' &&
  existsSync(installer)
) {
  const result = spawnSync(process.execPath, [installer], {
    stdio: 'inherit',
    windowsHide: true,
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
