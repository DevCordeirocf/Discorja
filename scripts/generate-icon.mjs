import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32')
  throw new Error('A geração do ícone do Discorja precisa do Windows.');

execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-NonInteractive',
    '-ExecutionPolicy',
    'Bypass',
    '-File',
    fileURLToPath(new URL('./generate-icon.ps1', import.meta.url)),
  ],
  { stdio: 'inherit', windowsHide: true },
);
