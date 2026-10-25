import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createAudioBuildBatch,
  runWindowsBatchFile,
} from '../scripts/audio-build-command.mjs';

const windowsOnly = process.platform === 'win32' ? it : it.skip;

describe('compilação do helper de áudio', () => {
  it('mantém caminhos do compilador, fonte e artefatos entre aspas no batch', () => {
    const batch = createAudioBuildBatch({
      vcvars: 'C:\\Program Files\\Visual Studio\\vcvars64.bat',
      source: 'D:\\workspace\\Discorja App\\capture.cpp',
      objectFile: 'D:\\workspace\\Discorja App\\capture.obj',
      output: 'D:\\workspace\\Discorja App\\capture.exe',
    });

    expect(batch).toContain(
      'call "C:\\Program Files\\Visual Studio\\vcvars64.bat" >nul',
    );
    expect(batch).toContain('if errorlevel 1 exit /b %errorlevel%');
    expect(batch).toContain('"D:\\workspace\\Discorja App\\capture.cpp"');
    expect(batch).toContain('/Fo:"D:\\workspace\\Discorja App\\capture.obj"');
    expect(batch).toContain('/OUT:"D:\\workspace\\Discorja App\\capture.exe"');
  });

  windowsOnly(
    'interrompe a compilação e preserva o código de erro do vcvars',
    async () => {
      const directory = await mkdtemp(
        path.join(os.tmpdir(), 'Discorja Audio Build Failure '),
      );
      try {
        const vcvars = path.join(directory, 'Visual Studio', 'vcvars64.bat');
        const script = path.join(directory, 'compile helper.cmd');
        await mkdir(path.dirname(vcvars), { recursive: true });
        await writeFile(vcvars, '@echo off\r\nexit /b 17\r\n', 'utf8');
        await writeFile(
          script,
          createAudioBuildBatch({
            vcvars,
            source: 'source.cpp',
            objectFile: 'object.obj',
            output: 'output.exe',
            compiler: 'missing-compiler.cmd',
          }),
          'utf8',
        );

        let status: number | null = null;
        try {
          runWindowsBatchFile(script, directory, 'pipe');
        } catch (error) {
          status = (error as { status?: number }).status ?? null;
        }
        expect(status).toBe(17);
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
});
