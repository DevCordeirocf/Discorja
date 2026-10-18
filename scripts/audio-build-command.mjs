import { execFileSync } from 'node:child_process';

export function createAudioBuildBatch({
  vcvars,
  source,
  objectFile,
  output,
  compiler = 'cl.exe',
}) {
  return [
    '@echo off',
    `call "${vcvars}" >nul`,
    'if errorlevel 1 exit /b %errorlevel%',
    `${compiler} /nologo /std:c++20 /EHsc /O2 /W4 /DUNICODE /D_UNICODE "${source}" /Fo:"${objectFile}" /link Mmdevapi.lib Ole32.lib Uuid.lib /OUT:"${output}"`,
    'exit /b %errorlevel%',
    '',
  ].join('\r\n');
}

export function runWindowsBatchFile(scriptPath, cwd, stdio = 'inherit') {
  execFileSync('cmd.exe', ['/d', '/c', `"${scriptPath}"`], {
    cwd,
    stdio,
    windowsVerbatimArguments: true,
  });
}
