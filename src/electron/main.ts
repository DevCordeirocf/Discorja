import {
  app,
  BrowserWindow,
  clipboard,
  desktopCapturer,
  dialog,
  ipcMain,
  net,
  powerSaveBlocker,
  protocol,
  powerMonitor,
  session,
  shell,
} from 'electron';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  allowedExternalUrl,
  authorizedFrame,
  pasteOnContextMenu,
  rendererFile,
  trustedAppUrl,
} from './security';
import { CaptureAuthorization, displayMediaPermission } from './capture';
import { DesktopLogs } from './logs';
import { errorFields, rendererLogEvent } from '../shared/logs';
import type { AppConfig, UpdateState } from '../shared/protocol';
import {
  DEFAULT_SIGNALING_URL,
  parseIceServers,
  validateSignalingUrl,
} from './config';
import { roomCode } from '../shared/validation';
import { GROUP_INVITE } from '../shared/groups';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      corsEnabled: true,
    },
  },
]);
app.setName('Discorja');
// The bundled startup sound is timed with the splash and should not require a click.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

let window: BrowserWindow | null = null;
let logs: DesktopLogs | undefined;
let logWindowStarted = 0;
let rendererLogCount = 0;
let exportingLogs = false;
let quitFlushed = false;
const captureAuthorization = new CaptureAuthorization();
let knownSources = new Set<string>();
let sourcesExpire = 0;
let sourceQueue: Promise<void> = Promise.resolve();
let sourceRequests = 0;
let sharing = false;
let filteredAudioProcess: ChildProcessWithoutNullStreams | null = null;
let stoppingFilteredAudio = false;
let filteredAudioStopPromise: Promise<void> | null = null;
let powerBlock: number | undefined;
let signalingUrl = DEFAULT_SIGNALING_URL;
let iceServers: RTCIceServer[] = [];
let updateState: UpdateState = {
  status: 'disabled',
  message: 'Atualizações disponíveis em versões com distribuição configurada.',
};
let updater: import('electron-updater').AppUpdater | undefined;
let release: { owner: string; repo: string; publisherName?: string } | null =
  null;
const devUrl =
  !app.isPackaged && process.env.DISCORJA_DEV_URL === 'http://127.0.0.1:5173'
    ? process.env.DISCORJA_DEV_URL
    : null;

function trustedUrl(url: string): boolean {
  return trustedAppUrl(url, devUrl);
}

function assertSender(event: Electron.IpcMainInvokeEvent) {
  if (!window || !authorizedFrame(event, window.webContents, devUrl)) {
    throw new Error('Solicitação não autorizada.');
  }
}

function setSharing(value: boolean) {
  if (sharing !== value)
    logs?.write({ event: value ? 'capture.started' : 'capture.stopped' });
  sharing = value;
  if (!value) void stopFilteredAudioCapture();
  if (window && !window.isDestroyed()) {
    window.setTitle(value ? '● Compartilhando — Discorja' : 'Discorja');
    // Keep quality monitoring and recovery timers running when the host minimizes
    // Discorja to work in the shared window. Restore normal power saving on stop.
    window.webContents.setBackgroundThrottling(!value);
  }
  if (value && powerBlock === undefined)
    powerBlock = powerSaveBlocker.start('prevent-display-sleep');
  if (!value && powerBlock !== undefined) {
    powerSaveBlocker.stop(powerBlock);
    powerBlock = undefined;
  }
}

function filteredAudioExecutable(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'discorja-audio-capture.exe')
    : path.join(
        app.getAppPath(),
        'build',
        'native',
        'discorja-audio-capture.exe',
      );
}

function filteredAudioMessage(details: string): string {
  if (details.includes('DISCORD_NOT_FOUND_OR_MULTIPLE'))
    return 'Abra o aplicativo Discord e mantenha apenas uma instância aberta para excluir o áudio da transmissão.';
  if (details.includes('DISCORD_INSTANCE_CHANGED'))
    return 'A instância do Discord mudou ou foi encerrada. O áudio foi interrompido e a transmissão segue sem áudio.';
  if (details.includes('LOOPBACK_UNAVAILABLE'))
    return 'A captura filtrada do Discord exige uma versão compatível do Windows. O vídeo continuará sem áudio.';
  if (details.includes('LOOPBACK_INIT'))
    return 'O Windows não conseguiu iniciar a captura filtrada. Atualize o Windows e tente novamente; o vídeo continuará sem áudio.';
  return 'Não foi possível excluir o Discord do áudio. O vídeo continuará sem áudio.';
}

function startFilteredAudioCapture(): Promise<number> {
  if (process.platform !== 'win32')
    return Promise.reject(
      new Error('A exclusão de áudio está disponível no Windows.'),
    );
  if (filteredAudioProcess || filteredAudioStopPromise)
    return Promise.reject(new Error('A captura filtrada já está ativa.'));
  const executable = filteredAudioExecutable();
  if (!existsSync(executable))
    return Promise.reject(
      new Error(
        'Esta versão do Discorja foi empacotada sem o componente de áudio filtrado. Atualize para uma versão criada com esse recurso; o áudio não será capturado sem o filtro.',
      ),
    );

  const child = spawn(executable, ['--capture-discord'], {
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  filteredAudioProcess = child;
  stoppingFilteredAudio = false;

  return new Promise((resolve, reject) => {
    let ready = false;
    let settled = false;
    let stderrBuffer = '';
    let runtimeFailure = '';
    let audioBuffer = Buffer.alloc(0);
    const startupTimeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill();
      reject(new Error('A captura filtrada demorou demais para iniciar.'));
    }, 10_000);
    startupTimeout.unref();

    const sendAudio = () => {
      const packetBytes = 7_680; // 40 ms at 48 kHz, stereo, 16-bit PCM.
      while (audioBuffer.length >= packetBytes) {
        const packet = audioBuffer.subarray(0, packetBytes);
        audioBuffer = audioBuffer.subarray(packetBytes);
        if (window && !window.isDestroyed())
          window.webContents.send(
            'capture:filtered-audio:data',
            new Uint8Array(packet),
          );
      }
    };

    child.stdout.on('data', (chunk: Buffer) => {
      audioBuffer = Buffer.concat([audioBuffer, chunk]);
      sendAudio();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderrBuffer += chunk.toString('utf8');
      const lines = stderrBuffer.split(/\r?\n/u);
      stderrBuffer = lines.pop() ?? '';
      for (const line of lines) {
        const match = /^READY (\d+)$/u.exec(line.trim());
        if (match) {
          ready = true;
          if (!settled) {
            settled = true;
            clearTimeout(startupTimeout);
            resolve(Number(match[1]));
          }
        } else if (line.startsWith('ERROR ')) {
          const message = filteredAudioMessage(line);
          if (!ready && !settled) {
            settled = true;
            clearTimeout(startupTimeout);
            reject(new Error(message));
          } else runtimeFailure = message;
        }
      }
    });
    child.once('error', (error) => {
      if (!settled) {
        settled = true;
        clearTimeout(startupTimeout);
        reject(error);
      }
    });
    child.once('exit', (code) => {
      clearTimeout(startupTimeout);
      const expected = stoppingFilteredAudio;
      filteredAudioProcess = null;
      stoppingFilteredAudio = false;
      if (!settled) {
        settled = true;
        reject(
          new Error(
            filteredAudioMessage(stderrBuffer || `EXIT ${String(code)}`),
          ),
        );
      } else if (ready && !expected && window && !window.isDestroyed()) {
        window.webContents.send(
          'capture:filtered-audio:error',
          runtimeFailure ||
            'A captura filtrada do Discord foi interrompida. O vídeo continua; reinicie o compartilhamento para enviar áudio.',
        );
      }
    });
  });
}

async function stopFilteredAudioCapture(): Promise<void> {
  if (filteredAudioStopPromise) return filteredAudioStopPromise;
  const child = filteredAudioProcess;
  if (!child) return;
  stoppingFilteredAudio = true;
  filteredAudioStopPromise = (async () => {
    const exited = new Promise<void>((resolve) =>
      child.once('exit', () => resolve()),
    );
    // setSharing(false) and the renderer's explicit stop can arrive together.
    // Do not end stdin twice: Node throws ERR_STREAM_WRITE_AFTER_END.
    if (!child.stdin.destroyed && !child.stdin.writableEnded)
      child.stdin.end('x');
    const timeout = setTimeout(() => {
      if (child.exitCode === null) child.kill();
    }, 1_000);
    timeout.unref();
    try {
      await exited;
    } finally {
      clearTimeout(timeout);
      filteredAudioStopPromise = null;
    }
  })();
  return filteredAudioStopPromise;
}

function publishUpdate(state: UpdateState) {
  if (state.status === 'error' && updateState.status !== 'error')
    logs?.write({ event: 'updater.error' });
  updateState = state;
  if (window && !window.isDestroyed())
    window.webContents.send('updates:state', state);
}

async function checkUpdates() {
  if (
    !updater ||
    ['checking', 'downloading', 'downloaded'].includes(updateState.status)
  )
    return;
  try {
    await updater.checkForUpdates();
  } catch {
    publishUpdate({
      status: 'error',
      message:
        'Não foi possível verificar atualizações. Tente novamente mais tarde.',
    });
  }
}

async function configureUpdates() {
  if (!app.isPackaged || process.platform !== 'win32' || !release) return;
  // electron-updater checks the download hash. When a publisher is configured in
  // app-update.yml, it also verifies the Windows signature before accepting it.
  const { default: updaterModule } = await import('electron-updater');
  const { autoUpdater } = updaterModule;
  updater = autoUpdater;
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  updater.allowDowngrade = false;
  updater.on('checking-for-update', () =>
    publishUpdate({ status: 'checking' }),
  );
  updater.on('update-available', (info) =>
    publishUpdate({ status: 'available', version: info.version }),
  );
  updater.on('download-progress', (info) =>
    publishUpdate({
      status: 'downloading',
      version: updateState.version,
      percent: Number.isFinite(info.percent)
        ? Math.max(0, Math.min(100, info.percent))
        : 0,
    }),
  );
  updater.on('update-downloaded', (info) =>
    publishUpdate({ status: 'downloaded', version: info.version }),
  );
  updater.on('update-not-available', () =>
    publishUpdate({ status: 'current' }),
  );
  updater.on('error', () =>
    publishUpdate({
      status: 'error',
      message:
        'Falha ao baixar ou validar a atualização. A versão atual continuará disponível.',
    }),
  );
  publishUpdate({ status: 'idle' });
  setTimeout(() => void checkUpdates(), 5000).unref();
}

function foreground(): boolean {
  return Boolean(
    window &&
    !window.isDestroyed() &&
    window.isVisible() &&
    !window.isMinimized() &&
    window.isFocused(),
  );
}

function registerIpc() {
  const handle = (channel: string, callback: (...args: any[]) => unknown) => {
    ipcMain.handle(channel, (event, ...args) => {
      assertSender(event);
      return callback(...args);
    });
  };
  handle('window:foreground', foreground);
  handle('window:minimize', () => window?.minimize());
  handle('window:toggle-maximize', () => {
    if (!window || window.isDestroyed()) return;
    if (window.isMaximized()) window.unmaximize();
    else window.maximize();
  });
  handle('window:close', () => window?.close());
  handle('logs:record', (input: unknown) => {
    if (Date.now() - logWindowStarted >= 10_000) {
      logWindowStarted = Date.now();
      rendererLogCount = 0;
    }
    if (++rendererLogCount > 40) return;
    const safe = rendererLogEvent(input);
    if (safe) logs?.write(safe);
  });
  handle('logs:export', async () => {
    if (!logs || exportingLogs) return false;
    exportingLogs = true;
    try {
      const result = await dialog.showSaveDialog(window!, {
        title: 'Salvar logs de erros',
        defaultPath: 'discorja-logs.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      });
      if (result.canceled || !result.filePath) return false;
      await writeFile(
        result.filePath,
        JSON.stringify(await logs.snapshot(), null, 2),
        'utf8',
      );
      return true;
    } finally {
      exportingLogs = false;
    }
  });
  handle('config:get', (): AppConfig => ({
    signalingUrl,
    iceServers,
    version: app.getVersion(),
    updatesConfigured: Boolean(
      app.isPackaged && process.platform === 'win32' && release,
    ),
    systemAudioSupported: process.platform === 'win32',
  }));
  handle('config:save', async (config: unknown) => {
    if (!config || typeof config !== 'object')
      throw new Error('Configuração inválida.');
    const next = validateSignalingUrl(
      (config as { signalingUrl?: unknown }).signalingUrl,
    );
    await writeFile(
      path.join(app.getPath('userData'), 'settings.json'),
      JSON.stringify({ signalingUrl: next }),
      'utf8',
    );
    signalingUrl = next;
  });
  handle('capture:sources', async () => {
    if (sourceRequests >= 2)
      throw new Error('Aguarde a lista de janelas terminar de atualizar.');
    sourceRequests++;
    // Electron may coalesce simultaneous enumerations. After cancel/reopen,
    // wait for the older request and take a fresh snapshot, with a bounded queue.
    const request = sourceQueue.then(async () => {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 360, height: 210 },
      });
      knownSources = new Set(sources.map((source) => source.id));
      sourcesExpire = Date.now() + 60000;
      return sources.map((source) => ({
        id: source.id,
        name: source.name,
        kind: source.id.startsWith('screen:') ? 'screen' : 'window',
        thumbnail: source.thumbnail.toDataURL(),
      }));
    });
    sourceQueue = request.then(
      () => undefined,
      () => undefined,
    );
    try {
      return await request;
    } finally {
      sourceRequests--;
    }
  });
  handle('capture:select', (id: unknown, audio: unknown = false) => {
    captureAuthorization.cancel();
    if (
      typeof id !== 'string' ||
      Date.now() > sourcesExpire ||
      !knownSources.has(id)
    )
      throw new Error('Atualize a lista e escolha uma janela ou monitor.');
    captureAuthorization.select(id, audio, process.platform);
  });
  handle('capture:filtered-audio:start', startFilteredAudioCapture);
  handle('capture:filtered-audio:stop', stopFilteredAudioCapture);
  handle('capture:cancel', () => {
    captureAuthorization.cancel();
  });
  handle('capture:sharing', (value: unknown) => {
    if (typeof value !== 'boolean')
      throw new Error('Estado de transmissão inválido.');
    setSharing(value);
  });
  handle('room:copy', (code: unknown) => {
    if (!roomCode(code)) throw new Error('Código inválido.');
    clipboard.writeText(code);
  });
  handle('group:copy-invite', (invite: unknown) => {
    if (typeof invite !== 'string' || !GROUP_INVITE.test(invite))
      throw new Error('Convite inválido.');
    clipboard.writeText(invite);
  });
  handle('updates:check', checkUpdates);
  handle('updates:state', () => updateState);
  handle('updates:download', async () => {
    if (!updater || updateState.status !== 'available') return;
    publishUpdate({
      status: 'downloading',
      version: updateState.version,
      percent: 0,
    });
    try {
      await updater.downloadUpdate();
    } catch {
      publishUpdate({
        status: 'error',
        message: 'Não foi possível baixar ou validar a atualização.',
      });
    }
  });
  handle('diagnostics:export', async (report: unknown) => {
    const { sanitizeDiagnostics } = await import('../shared/diagnostics');
    const rendererMemory = app
      .getAppMetrics()
      .find(
        (metric) => metric.pid === window?.webContents.getOSProcessId(),
      )?.memory;
    const safe = sanitizeDiagnostics(report, app.getVersion(), {
      platform: process.platform,
      architecture: process.arch,
      electron: process.versions.electron,
      chromium: process.versions.chrome,
      node: process.versions.node,
      updateStatus: updateState.status,
      workingSetKiB: rendererMemory?.workingSetSize,
      privateKiB: rendererMemory?.privateBytes,
    });
    const result = await dialog.showSaveDialog(window!, {
      title: 'Salvar diagnóstico',
      defaultPath: 'discorja-diagnostico.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (!result.canceled && result.filePath)
      await writeFile(result.filePath, JSON.stringify(safe, null, 2), 'utf8');
  });
  handle('updates:install', () => {
    if (!updater || updateState.status !== 'downloaded') return;
    if (sharing)
      throw new Error('Pare a transmissão antes de reiniciar para atualizar.');
    updater.quitAndInstall(false, true);
  });
}

async function main() {
  await app.whenReady();
  logs = new DesktopLogs(
    path.join(app.getPath('userData'), 'logs'),
    512 * 1024,
    app.getVersion(),
  );
  logs.write({ event: 'app.started', details: { version: app.getVersion() } });
  powerMonitor.on('suspend', () => logs?.write({ event: 'power.suspend' }));
  powerMonitor.on('resume', () => logs?.write({ event: 'power.resume' }));
  const settingsPath = path.join(app.getPath('userData'), 'settings.json');
  try {
    signalingUrl = validateSignalingUrl(
      JSON.parse(await readFile(settingsPath, 'utf8')).signalingUrl,
    );
  } catch {
    signalingUrl = DEFAULT_SIGNALING_URL;
  }
  if (process.env.DISCORJA_SIGNALING_URL)
    signalingUrl = validateSignalingUrl(process.env.DISCORJA_SIGNALING_URL);
  try {
    iceServers = parseIceServers(process.env.DISCORJA_ICE_SERVERS);
  } catch {
    // A bad override must not stop the app; the value itself is never logged.
    iceServers = parseIceServers(undefined);
    logs?.write({ event: 'app.exception', details: { reason: 'rejected' } });
  }
  try {
    release = JSON.parse(
      await readFile(path.join(__dirname, 'release.json'), 'utf8'),
    );
  } catch {
    release = null;
  }
  const rendererRoot = path.resolve(__dirname, '../renderer');
  protocol.handle('app', (request) => {
    const target = rendererFile(rendererRoot, request.url);
    if (!target || request.method !== 'GET')
      return new Response('Forbidden', { status: 403 });
    return net.fetch(pathToFileURL(target).toString());
  });
  const ses = session.defaultSession;
  const allowedPermission = (permission: string) =>
    permission === 'display-capture' ||
    permission === 'fullscreen' ||
    (permission === 'loopback-network' &&
      ['localhost', '127.0.0.1'].includes(new URL(signalingUrl).hostname));
  ses.setPermissionRequestHandler((contents, permission, callback, details) => {
    // Display capture keeps its existing explicit authorization flow. The profile
    // editor may request a camera-only stream after the user starts the camera UI;
    // microphone access remains denied.
    const captureVideo =
      permission === 'media' &&
      'mediaTypes' in details &&
      displayMediaPermission(
        captureAuthorization.pending(),
        details.mediaTypes,
      );
    const profileCamera =
      permission === 'media' &&
      'mediaTypes' in details &&
      details.mediaTypes?.includes('video') &&
      !details.mediaTypes?.includes('audio');
    callback(
      Boolean(
        window &&
        contents === window.webContents &&
        trustedUrl(contents.getURL()) &&
        (allowedPermission(permission) || captureVideo || profileCamera),
      ),
    );
  });
  ses.setPermissionCheckHandler((contents, permission, origin, details) => {
    const profileCamera =
      permission === 'media' && details?.mediaType === 'video';
    return Boolean(
      window &&
      contents === window.webContents &&
      trustedUrl(origin) &&
      (allowedPermission(permission) || profileCamera),
    );
  });
  ses.setDevicePermissionHandler(() => false);
  ses.on('will-download', (event) => event.preventDefault());
  ses.setDisplayMediaRequestHandler(async (request, callback) => {
    const reply = (streams: Electron.Streams) => {
      // A closed requesting frame already aborts its pending capture.
      if (request.frame && !request.frame.isDestroyed()) callback(streams);
    };
    const pick = captureAuthorization.consume(request.audioRequested);
    if (
      !window ||
      request.frame !== window.webContents.mainFrame ||
      !trustedUrl(request.securityOrigin) ||
      !request.userGesture ||
      !request.videoRequested ||
      !pick ||
      Date.now() > pick.expires
    ) {
      reply({});
      return;
    }
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 0, height: 0 },
      });
      const source = sources.find((item) => item.id === pick.id);
      if (
        !source ||
        !captureAuthorization.current(pick) ||
        !window ||
        request.frame !== window.webContents.mainFrame ||
        request.frame.isDestroyed()
      ) {
        reply({});
        return;
      }
      reply({
        video: source,
        ...(request.audioRequested && pick.audio
          ? { audio: 'loopback' as const }
          : {}),
      });
    } catch {
      reply({});
    }
  });
  registerIpc();
  window = new BrowserWindow({
    frame: process.platform !== 'win32',
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 700,
    backgroundColor: '#101115',
    title: 'Discorja',
    icon: path.join(__dirname, 'icon.ico'),
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
    },
  });
  // Native visibility remains reliable while backgroundThrottling is disabled
  // for capture. This signal controls only the local preview player.
  const publishForeground = (active: boolean) =>
    window?.webContents.send('window:foreground', active);
  window.on('focus', () => publishForeground(true));
  window.on('blur', () => publishForeground(false));
  window.on('minimize', () => publishForeground(false));
  window.on('restore', () => publishForeground(foreground()));
  window.on('show', () => publishForeground(foreground()));
  window.on('hide', () => publishForeground(false));
  window.removeMenu();
  window.webContents.setWindowOpenHandler(({ url }) => {
    // Only exact allowlisted pages open, and always in the system browser.
    const externalUrl = allowedExternalUrl(url);
    if (externalUrl)
      void shell.openExternal(externalUrl).catch(() => undefined);
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event) => {
    event.preventDefault();
  });
  window.webContents.on('context-menu', (_event, params) => {
    if (pasteOnContextMenu(params)) window?.webContents.paste();
  });
  window.webContents.on('will-frame-navigate', (event) =>
    event.preventDefault(),
  );
  window.webContents.on('will-attach-webview', (event) =>
    event.preventDefault(),
  );
  window.webContents.on('page-title-updated', (event) =>
    event.preventDefault(),
  );
  window.webContents.on('render-process-gone', (_event, details) => {
    logs?.write({
      event: 'renderer.gone',
      details: { reason: details.reason, exitCode: details.exitCode },
    });
    captureAuthorization.cancel();
    setSharing(false);
  });
  window.on('unresponsive', () =>
    logs?.write({ event: 'renderer.unresponsive' }),
  );
  window.on('responsive', () => logs?.write({ event: 'renderer.responsive' }));
  window.on('closed', () => {
    captureAuthorization.cancel();
    setSharing(false);
    window = null;
  });
  window.once('ready-to-show', () => window?.show());
  await window.loadURL(devUrl ?? 'app://discorja/index.html');
  await configureUpdates();
  window.webContents.send('updates:state', updateState);
}

app.on('window-all-closed', () => app.quit());
app.on('before-quit', (event) => {
  captureAuthorization.cancel();
  setSharing(false);
  if (logs && !quitFlushed) {
    event.preventDefault();
    quitFlushed = true;
    logs.write({ event: 'app.stopping' });
    // A broken disk must not keep the application alive indefinitely.
    const deadline = setTimeout(() => app.exit(), 2000);
    void logs.flush().finally(() => {
      clearTimeout(deadline);
      app.quit();
    });
  }
});
process.on('uncaughtExceptionMonitor', (error) =>
  logs?.fatal({ event: 'app.exception', details: errorFields(error) }),
);
process.on('unhandledRejection', (error) => {
  logs?.write({ event: 'app.rejection', details: errorFields(error) });
  app.quit();
});
main().catch((error) => {
  logs?.fatal({ event: 'app.start-failed', details: errorFields(error) });
  console.error('Falha ao iniciar Discorja:', error);
  dialog.showErrorBox(
    'Não foi possível iniciar o Discorja',
    error instanceof Error ? error.message : 'Erro desconhecido.',
  );
  app.quit();
});
