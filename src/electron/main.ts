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
  session,
} from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { authorizedFrame, rendererFile, trustedAppUrl } from './security';
import { CaptureAuthorization, displayMediaPermission } from './capture';
import type { AppConfig, UpdateState } from '../shared/protocol';
import {
  DEFAULT_SIGNALING_URL,
  parseIceServers,
  validateSignalingUrl,
} from './config';

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

let window: BrowserWindow | null = null;
const captureAuthorization = new CaptureAuthorization();
let knownSources = new Set<string>();
let sourcesExpire = 0;
let sharing = false;
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
  sharing = value;
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

function publishUpdate(state: UpdateState) {
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

function registerIpc() {
  const handle = (channel: string, callback: (...args: any[]) => unknown) => {
    ipcMain.handle(channel, (event, ...args) => {
      assertSender(event);
      return callback(...args);
    });
  };
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
  handle('capture:cancel', () => {
    captureAuthorization.cancel();
  });
  handle('capture:sharing', (value: unknown) => {
    if (typeof value !== 'boolean')
      throw new Error('Estado de transmissão inválido.');
    setSharing(value);
  });
  handle('room:copy', (code: unknown) => {
    if (typeof code !== 'string' || !/^[A-Z2-9]{4}[- ]?[A-Z2-9]{4}$/.test(code))
      throw new Error('Código inválido.');
    clipboard.writeText(code);
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
    const safe = sanitizeDiagnostics(report, app.getVersion());
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
  iceServers = parseIceServers(process.env.DISCORJA_ICE_SERVERS);
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
    // Chromium requests generic media permission before the desktop capture handler.
    // Display capture has an empty mediaTypes list; camera/microphone requests identify
    // their devices. The display handler grants only explicitly selected system audio.
    const captureVideo =
      permission === 'media' &&
      'mediaTypes' in details &&
      displayMediaPermission(
        captureAuthorization.pending(),
        details.mediaTypes,
      );
    callback(
      Boolean(
        window &&
        contents === window.webContents &&
        trustedUrl(contents.getURL()) &&
        (allowedPermission(permission) || captureVideo),
      ),
    );
  });
  ses.setPermissionCheckHandler((contents, permission, origin) => {
    return Boolean(
      window &&
      contents === window.webContents &&
      trustedUrl(origin) &&
      allowedPermission(permission),
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
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 700,
    backgroundColor: '#0c0e13',
    title: 'Discorja',
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
  window.removeMenu();
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, url) => {
    event.preventDefault();
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
  window.webContents.on('render-process-gone', () => {
    captureAuthorization.cancel();
    setSharing(false);
  });
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
app.on('before-quit', () => {
  captureAuthorization.cancel();
  setSharing(false);
});
main().catch((error) => {
  console.error('Falha ao iniciar Discorja:', error);
  dialog.showErrorBox(
    'Não foi possível iniciar o Discorja',
    error instanceof Error ? error.message : 'Erro desconhecido.',
  );
  app.quit();
});
