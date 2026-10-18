import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
    'executa vcvars e o compilador quando os caminhos têm espaços',
    async () => {
      const directory = await mkdtemp(
        path.join(os.tmpdir(), 'Discorja Audio Build '),
      );
      try {
        const vcvars = path.join(directory, 'Visual Studio', 'vcvars64.bat');
        const compiler = path.join(directory, 'fake-cl.cmd');
        const script = path.join(directory, 'compile audio helper.cmd');
        const marker = path.join(directory, 'vcvars loaded.txt');
        const argumentsFile = path.join(directory, 'compiler arguments.txt');
        await mkdir(path.dirname(vcvars), { recursive: true });
        await writeFile(
          vcvars,
          `@echo off\r\necho loaded>"${marker}"\r\nexit /b 0\r\n`,
          'utf8',
        );
        await writeFile(
          compiler,
          `@echo off\r\necho %*>"${argumentsFile}"\r\nexit /b 0\r\n`,
          'utf8',
        );
        await writeFile(
          script,
          createAudioBuildBatch({
            vcvars,
            source: path.join(directory, 'source file.cpp'),
            objectFile: path.join(directory, 'object file.obj'),
            output: path.join(directory, 'output file.exe'),
            compiler: 'fake-cl.cmd',
          }),
          'utf8',
        );

        runWindowsBatchFile(script, directory, 'pipe');

        expect(await readFile(marker, 'utf8')).toContain('loaded');
        const args = await readFile(argumentsFile, 'utf8');
        expect(args).toContain(
          '"' + path.join(directory, 'source file.cpp') + '"',
        );
        expect(args).toContain(
          '/Fo:"' + path.join(directory, 'object file.obj') + '"',
        );
        expect(args).toContain(
          '/OUT:"' + path.join(directory, 'output file.exe') + '"',
        );
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );

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
