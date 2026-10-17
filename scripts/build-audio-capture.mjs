import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.platform !== 'win32') {
  throw new Error(
    'A captura filtrada do Discord só pode ser compilada no Windows.',
  );
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const programFilesX86 =
  process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
const vswhere = path.join(
  programFilesX86,
  'Microsoft Visual Studio',
  'Installer',
  'vswhere.exe',
);
if (!existsSync(vswhere)) {
  throw new Error(
    'Instale o Visual Studio Build Tools com a carga “Desenvolvimento para desktop com C++” para compilar a captura filtrada.',
  );
}

const installationPath = execFileSync(
  vswhere,
  [
    '-latest',
    '-products',
    '*',
    '-requires',
    'Microsoft.VisualStudio.Component.VC.Tools.x86.x64',
    '-property',
    'installationPath',
  ],
  { encoding: 'utf8' },
).trim();
if (!installationPath) {
  throw new Error(
    'O compilador C++ da Microsoft não foi encontrado. Instale o Visual Studio Build Tools com a carga “Desenvolvimento para desktop com C++”.',
  );
}

const vcvars = path.join(
  installationPath,
  'VC',
  'Auxiliary',
  'Build',
  'vcvars64.bat',
);
const outputDirectory = path.join(root, 'build', 'native');
await mkdir(outputDirectory, { recursive: true });
const source = path.join(
  root,
  'native',
  'windows',
  'discord-audio-capture.cpp',
);
const output = path.join(outputDirectory, 'discorja-audio-capture.exe');
const compileScript = path.join(outputDirectory, 'compile-audio-capture.cmd');
const objectFile = path.join(outputDirectory, 'discord-audio-capture.obj');
await writeFile(
  compileScript,
  [
    '@echo off',
    `call "${vcvars}" >nul`,
    'if errorlevel 1 exit /b %errorlevel%',
    `cl.exe /nologo /std:c++20 /EHsc /O2 /W4 /DUNICODE /D_UNICODE "${source}" /Fo:"${objectFile}" /link Mmdevapi.lib Ole32.lib Uuid.lib /OUT:"${output}"`,
    'exit /b %errorlevel%',
    '',
  ].join('\r\n'),
  'utf8',
);
try {
  // Calling a batch file avoids cmd.exe reinterpreting the nested quotes in
  // vcvars64.bat when Node builds the Windows command line.
  execFileSync('cmd.exe', ['/d', '/c', `"${compileScript}"`], {
    cwd: outputDirectory,
    stdio: 'inherit',
    windowsVerbatimArguments: true,
  });
} finally {
  await rm(compileScript, { force: true });
}
const outputInfo = await stat(output).catch(() => null);
if (!outputInfo?.isFile() || outputInfo.size === 0)
  throw new Error(
    'O compilador terminou sem gerar o helper de áudio filtrado.',
  );
console.log(`Captura filtrada compilada: ${path.relative(root, output)}`);
