import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createSignalingServer } from '../dist/server/server.js';
import {
  installQualityProbe,
  qualitySnapshot,
  collectQuality,
} from './quality-probe.mjs';

// Uses real Electron, desktop capture of a purpose-built test window and real local WebRTC.
// No capture of a monitor or unrelated user window is requested.
await mkdir('test-results', { recursive: true });
const service = createSignalingServer();
await new Promise((done, reject) => {
  service.server.once('error', reject);
  service.server.listen(0, '127.0.0.1', done);
});
const port = service.server.address().port;
const applications = [];
const pages = [];
const errors = [];
const checks = [];
const qualityPhases = [];
const environment = {};
const packaged = process.argv.includes('--packaged');
const networkStress = process.argv.includes('--network-stress');
const codecMatrix = process.argv.includes('--codec-matrix');
const soakMinutes = Number(
  process.argv
    .find((arg) => arg.startsWith('--soak-minutes='))
    ?.split('=')[1] ?? 0,
);
if (!Number.isInteger(soakMinutes) || soakMinutes < 0 || soakMinutes > 60)
  throw new Error('soak-minutes must be an integer between 0 and 60');
const deadline = setTimeout(
  () => {
    console.error(
      'E2E exceeded the 180-second deadline. Closing only its test applications.',
    );
    for (const application of applications) application.process().kill();
    process.exitCode = 1;
  },
  180_000 + soakMinutes * 60_000 + (codecMatrix ? 120_000 : 0),
);
function recordQuality(phase) {
  qualityPhases.push(phase);
  console.log(
    'Quality phase:',
    phase.profile,
    JSON.stringify(
      phase.receiver?.peers.flatMap((peer) =>
        peer.video.map((video) => ({
          resolution: `${video.width}x${video.height}`,
          fps: video.measuredFps,
          mbps: video.measuredMbps,
        })),
      ),
    ),
  );
}
function bounded(promise, label, timeout = 10000) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timeout: ${label}`)), timeout);
    }),
  ]).finally(() => clearTimeout(timer));
}
const env = {
  ...process.env,
  DISCORJA_SIGNALING_URL: `ws://127.0.0.1:${port}`,
  DISCORJA_ICE_SERVERS: '[]',
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.DISCORJA_DEV_URL;

async function launch() {
  const profile = await mkdtemp(resolve('test-results/profile-'));
  const application = await electron.launch({
    ...(packaged
      ? { executablePath: resolve('release/win-unpacked/Discorja.exe') }
      : {}),
    args: [...(packaged ? [] : ['.']), `--user-data-dir=${profile}`],
    cwd: process.cwd(),
    env,
    timeout: 30000,
  });
  applications.push(application);
  application
    .process()
    .stdout.on('data', (chunk) => console.log(chunk.toString().trim()));
  application.process().stderr.on('data', (chunk) => {
    if (/Error|denied|Failed/.test(chunk.toString()))
      console.error(chunk.toString().trim());
  });
  const page = await application.firstWindow();
  pages.push(page);
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning')
      console.error(message.text());
  });
  await expect(page.locator('[data-action=create]')).toBeEnabled();
  await installQualityProbe(page);
  return { application, page };
}

async function join(page, code, name) {
  await page.locator('#display-name').fill(name);
  await page.locator('#room-code').fill(code);
  await page
    .getByRole('button', { name: 'Entrar na sala', exact: true })
    .click();
  await expect(page.locator('.room-code')).toBeVisible();
}

async function startCapture(page) {
  await page.locator('[data-action=choose-source]').click();
  const option = page
    .locator('.source-option')
    .filter({ hasText: 'Discorja - janela de teste' });
  await expect(option).toHaveCount(1);
  await option.click();
  await page.locator('[data-action=start-share]').click();
  await expect(page.locator('[data-action=stop]')).toBeVisible({
    timeout: 15000,
  });
  await page.waitForFunction(
    () => document.querySelector('#stream-video')?.videoWidth > 0,
  );
}

async function expectVideo(page) {
  await page.waitForFunction(
    () => {
      const video = document.querySelector('#stream-video');
      return (
        video &&
        video.videoWidth > 0 &&
        video.getVideoPlaybackQuality().totalVideoFrames > 2
      );
    },
    undefined,
    { timeout: 20000 },
  );
  assert.equal(
    await page
      .locator('#stream-video')
      .evaluate((video) => video.srcObject.getAudioTracks().length),
    0,
  );
}

async function chooseQuality(page, preset) {
  await expect(page.locator('#quality-preset')).toBeEnabled();
  await page.locator('#quality-preset').selectOption(preset);
  await expect(page.locator('#quality-preset')).toBeEnabled();
}

async function expectSenderProfile(host, { width, height, fps, cap }) {
  let latest;
  try {
    await expect
      .poll(
        async () => {
          const snapshot = await qualitySnapshot(host);
          latest = snapshot;
          const senders = snapshot.peers.flatMap((peer) => peer.senders);
          return (
            senders.length > 0 &&
            senders.every(
              (sender) =>
                sender.requested.width.max === width &&
                sender.requested.height.max === height &&
                sender.requested.frameRate.max === fps &&
                sender.source.width > 0 &&
                sender.source.height > 0 &&
                sender.source.width <= width &&
                sender.source.height <= height &&
                sender.encodings.every(
                  (encoding) =>
                    encoding.maxFramerate === fps && encoding.maxBitrate <= cap,
                ),
            )
          );
        },
        { timeout: 15000 },
      )
      .toBe(true);
  } catch (error) {
    console.error(
      'Sender profile mismatch:',
      JSON.stringify({ expected: { width, height, fps, cap }, latest }),
    );
    throw error;
  }
}

try {
  const { application: hostApp, page: host } = await launch();
  console.log('Electron ready');
  environment.gpuFeatures = await bounded(
    hostApp.evaluate(({ app }) => app.getGPUFeatureStatus()),
    'GPU feature status',
  );
  environment.version = await hostApp.evaluate(({ app }) => app.getVersion());
  await host.screenshot({ path: 'test-results/home.png' });
  assert.equal(await host.evaluate(() => typeof window.require), 'undefined');
  const preferences = await bounded(
    hostApp.evaluate(({ BrowserWindow }) => {
      const prefs =
        BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
      return {
        sandbox: prefs.sandbox,
        nodeIntegration: prefs.nodeIntegration,
        contextIsolation: prefs.contextIsolation,
      };
    }),
    'main process preferences',
  );
  assert.deepEqual(preferences, {
    sandbox: true,
    nodeIntegration: false,
    contextIsolation: true,
  });
  checks.push('Renderer sandboxed, isolated and without Node.js access');
  assert.equal(
    await host.evaluate(async () => {
      try {
        await window.discorja.saveConfig({
          signalingUrl: 'file:///C:/Windows/win.ini',
        });
        return false;
      } catch {
        return true;
      }
    }),
    true,
  );
  assert.equal(
    await host.evaluate(async () => {
      try {
        await window.discorja.selectSource('unselected-remote-source');
        return false;
      } catch {
        return true;
      }
    }),
    true,
  );
  const blocked = await hostApp.evaluate(async ({ net }) => {
    const response = await net.fetch('app://discorja/%2e%2e%5cpackage.json');
    return response.status;
  });
  assert.equal(blocked, 403);
  checks.push(
    'IPC rejects unsafe configuration/capture and protocol blocks file traversal',
  );
  await hostApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send('updates:state', {
      status: 'available',
      version: '0.3.1',
    }),
  );
  await expect(
    host.getByRole('heading', { name: 'Atualização disponível' }),
  ).toBeVisible();
  await host.locator('[data-action=defer-update]').click();
  await hostApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send('updates:state', {
      status: 'downloaded',
      version: '0.3.1',
    }),
  );
  await expect(host.getByRole('dialog')).toHaveCount(0);
  await host.locator('[data-action=settings]').click();
  await host.locator('[data-action=install-update]').click();
  await expect(
    host.getByRole('heading', { name: 'Atualização pronta' }),
  ).toBeVisible();
  await host.locator('[data-action=defer-update]').click();
  await hostApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send('updates:state', {
      status: 'disabled',
    }),
  );
  checks.push(
    'Update popup shows a new version, can be deferred and reopened without installing',
  );
  const camera = await bounded(
    host.evaluate(async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: true,
        });
        stream.getTracks().forEach((track) => track.stop());
        return 'granted';
      } catch (error) {
        return error.name;
      }
    }),
    'camera permission denial',
  );
  assert.notEqual(camera, 'granted');
  checks.push('Camera access denied');
  console.log('Permission and isolation checks passed');

  await host.locator('#display-name').fill('Anfitrião');
  await host.locator('[data-action=create]').click();
  await expect(host.locator('.room-code')).toBeVisible();
  const code = (await host.locator('.room-code').innerText()).replace(
    /\s/g,
    '',
  );
  assert.match(code, /^[A-Z2-9]{8}$/);
  console.log('Room created');
  await expect(host.locator('#adaptive-quality')).toBeChecked();
  await host.locator('#adaptive-quality').uncheck();
  await chooseQuality(host, '1080p60');
  await host.locator('#content-mode').selectOption('motion');
  await host.locator('[data-action=choose-source]').click();
  await expect(
    host.locator('[data-action=cancel-sources]').first(),
  ).toBeVisible();
  await host.locator('[data-action=cancel-sources]').first().click();
  await expect(host.locator('[data-action=stop]')).toHaveCount(0);
  checks.push('Capture remains stopped after source-picker cancellation');
  console.log('Picker cancellation passed');

  const fixtureReady = hostApp.waitForEvent('window');
  await bounded(
    hostApp.evaluate(({ BrowserWindow }, fixturePath) => {
      const fixture = new BrowserWindow({
        width: 1920,
        height: 1080,
        frame: false,
        useContentSize: true,
        title: 'Discorja - janela de teste',
        webPreferences: {
          sandbox: true,
          nodeIntegration: false,
          contextIsolation: true,
          backgroundThrottling: false,
        },
      });
      globalThis.discorjaTestWindow = fixture;
      void fixture.loadFile(fixturePath);
      return true;
    }, resolve('scripts/fixtures/motion.html')),
    'fixture window creation',
  );
  const fixturePage = await bounded(fixtureReady, 'fixture window attachment');
  await expect(fixturePage).toHaveTitle('Discorja - janela de teste');
  environment.fixtureBounds = await hostApp.evaluate(() =>
    globalThis.discorjaTestWindow.getContentBounds(),
  );
  console.log('Fixture window ready');
  const { page: viewer } = await launch();
  await join(viewer, code, 'Amigo');
  await startCapture(host);
  await expectVideo(viewer);
  console.log('First viewer decoded frames');
  const diagnosticPath = resolve('test-results/diagnostics-export.json');
  await hostApp.evaluate(({ dialog }, filePath) => {
    globalThis.originalDiscorjaSaveDialog = dialog.showSaveDialog;
    dialog.showSaveDialog = async () => ({ canceled: false, filePath });
  }, diagnosticPath);
  try {
    await host.locator('[data-action=export-diagnostics]').click();
    await expect
      .poll(async () => {
        try {
          return JSON.parse(await readFile(diagnosticPath, 'utf8'))
            .schemaVersion;
        } catch {
          return 0;
        }
      })
      .toBe(1);
    const exported = JSON.parse(await readFile(diagnosticPath, 'utf8'));
    assert.deepEqual(Object.keys(exported).sort(), [
      'generatedAt',
      'preferences',
      'schemaVersion',
      'streams',
      'version',
    ]);
    assert.equal(JSON.stringify(exported).includes(code), false);
  } finally {
    await hostApp.evaluate(({ dialog }) => {
      dialog.showSaveDialog = globalThis.originalDiscorjaSaveDialog;
    });
  }
  checks.push(
    'Diagnostic export uses the native save flow and omits room identifiers',
  );
  await viewer.waitForTimeout(12000);
  checks.push(
    'Real video-only desktop window capture decoded by a viewer over WebRTC',
  );
  await expectSenderProfile(host, {
    width: 1920,
    height: 1080,
    fps: 60,
    cap: 12_000_000,
  });
  await viewer.evaluate(() => {
    window.testVideoElement = document.querySelector('#stream-video');
  });
  recordQuality({
    profile: '1080p60',
    host: await qualitySnapshot(host),
    receiver: await collectQuality(viewer),
  });
  assert.ok(
    await viewer
      .locator('#stream-video')
      .evaluate((video) => video.videoWidth > 0 && video.videoWidth <= 1920),
  );
  assert.equal(
    await viewer.evaluate(
      () => window.testVideoElement === document.querySelector('#stream-video'),
    ),
    true,
  );
  checks.push(
    '1080p60 target uses real sender parameters and telemetry preserves the video element',
  );

  for (const [preset, width, height, fps, cap] of [
    ['1080p30', 1920, 1080, 30, 8_000_000],
    ['720p30', 1280, 720, 30, 4_000_000],
  ]) {
    await chooseQuality(host, preset);
    await expectSenderProfile(host, { width, height, fps, cap });
    await expect
      .poll(
        () =>
          viewer
            .locator('#stream-video')
            .evaluate(
              (video, limit) =>
                video.videoWidth > 0 && video.videoWidth <= limit,
              width,
            ),
        { timeout: 15000 },
      )
      .toBe(true);
    recordQuality({
      profile: preset,
      host: await qualitySnapshot(host),
      receiver: await collectQuality(viewer),
    });
    if (preset === '1080p30') {
      await host.locator('#content-mode').selectOption('detail');
      await expect(host.locator('#content-mode')).toBeEnabled();
      recordQuality({
        profile: '1080p30-detail',
        host: await qualitySnapshot(host),
        receiver: await collectQuality(viewer),
      });
      await host.locator('#content-mode').selectOption('motion');
      await expect(host.locator('#content-mode')).toBeEnabled();
    }
    assert.equal(
      await viewer.evaluate(
        () =>
          window.testVideoElement === document.querySelector('#stream-video'),
      ),
      true,
    );
  }
  checks.push(
    'Live 1080p30 and 720p30 changes preserve the stream, room and video element',
  );
  await chooseQuality(host, '1080p60');
  await expectSenderProfile(host, {
    width: 1920,
    height: 1080,
    fps: 60,
    cap: 12_000_000,
  });
  await hostApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((win) => win.webContents.getURL().startsWith('app://discorja/'))
      .minimize(),
  );
  assert.equal(
    await hostApp.evaluate(
      ({ BrowserWindow }) =>
        BrowserWindow.getAllWindows().find((win) =>
          win.webContents.getURL().startsWith('app://discorja/'),
        ).webContents.backgroundThrottling,
    ),
    false,
  );
  const minimized = await collectQuality(viewer, 3000);
  assert.ok(
    minimized.peers.some((peer) =>
      peer.video.some((video) => video.measuredFps > 0),
    ),
  );
  recordQuality({ profile: '1080p60-host-minimized', receiver: minimized });
  await hostApp.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()
      .find((win) => win.webContents.getURL().startsWith('app://discorja/'))
      .restore(),
  );
  checks.push('Minimizing the host keeps capture and monitoring active');
  await viewer.screenshot({ path: 'test-results/viewer.png' });
  await host.screenshot({ path: 'test-results/sharing.png' });
  await host
    .locator('.quality-panel')
    .screenshot({ path: 'test-results/quality-controls.png' });
  await host
    .locator('.stream-diagnostics')
    .screenshot({ path: 'test-results/quality-diagnostics.png' });
  await viewer.locator('[data-action=fullscreen]').click();
  await viewer.waitForFunction(() => Boolean(document.fullscreenElement));
  await viewer.evaluate(() => document.exitFullscreen());
  console.log('Fullscreen checks passed');
  checks.push('Viewer fullscreen works');

  await host.locator('[data-action=stop]').click();
  await expect(viewer.locator('#stream-video')).toHaveCount(0);
  await expect(host.locator('.room-code')).toBeVisible();
  assert.equal(
    await hostApp.evaluate(({ BrowserWindow }) =>
      BrowserWindow.getAllWindows()
        .find((win) => win.webContents.getURL().startsWith('app://discorja/'))
        .getTitle(),
    ),
    'Discorja',
  );
  checks.push(
    'Stop closes capture and remote video while keeping the room open',
  );
  await startCapture(host);
  await expectVideo(viewer);
  checks.push('Restart negotiates a fresh video connection');
  console.log('Stop and restart passed');

  const { page: lateViewer } = await launch();
  await join(lateViewer, code, '<b>Amiga</b>');
  await expectVideo(lateViewer);
  // Drop the actual signaling transport; media must recover without selecting
  // another source or trusting a client-supplied role.
  const hostSocket = [...service.wss.clients][0];
  hostSocket.terminate();
  await expect(host.locator('.notice')).toContainText('recuperada', {
    timeout: 15000,
  });
  await expectVideo(viewer);
  await expectVideo(lateViewer);
  checks.push(
    'Host signaling resumes with its original capture and viewers recover video',
  );
  const viewerSocket = [...service.wss.clients][0];
  viewerSocket.terminate();
  await expect(viewer.locator('.notice')).toContainText('recuperada', {
    timeout: 15000,
  });
  await expectVideo(viewer);
  checks.push(
    'Viewer signaling resumes without duplicating membership or restarting capture',
  );
  await expect(
    host.locator('.person strong').filter({ hasText: '<b>Amiga</b>' }),
  ).toBeVisible();
  assert.equal(await host.locator('.person strong b').count(), 0);
  checks.push('Late viewer receives video; participant names render as text');
  await host.locator('#adaptive-quality').check();
  await expect(host.locator('#upload-budget')).toBeEnabled();
  await host.locator('#upload-budget').fill('4');
  await host.locator('#upload-budget').press('Tab');
  await expect
    .poll(
      async () => {
        const snapshot = await qualitySnapshot(host);
        const senders = snapshot.peers.flatMap((peer) => peer.senders);
        return (
          senders.length === 2 &&
          senders.reduce(
            (sum, sender) =>
              sum +
              sender.encodings.reduce(
                (total, encoding) => total + (encoding.maxBitrate ?? Infinity),
                0,
              ),
            0,
          ) <= 4_000_000
        );
      },
      { timeout: 15000 },
    )
    .toBe(true);
  recordQuality({
    profile: 'two-viewers-total-budget-4Mbps',
    host: await qualitySnapshot(host),
    receiver: await collectQuality(viewer, 2500),
  });
  checks.push('Two viewers share the configured total upload budget');
  await host.locator('#upload-budget').fill('40');
  await host.locator('#upload-budget').press('Tab');

  if (networkStress) {
    const cdp = await host.context().newCDPSession(host);
    await cdp.send('Network.emulateNetworkConditionsByRule', {
      matchedNetworkConditions: [
        {
          urlPattern: '',
          latency: 80,
          downloadThroughput: 1_000_000,
          uploadThroughput: 500_000,
          packetLoss: 12,
          packetQueueLength: 80,
        },
      ],
    });
    try {
      await host.waitForTimeout(16000);
      recordQuality({
        profile: 'CDP-p2p-stress-12percent-loss',
        host: await qualitySnapshot(host),
        receiver: await collectQuality(viewer, 3000),
      });
      checks.push(
        'Completed instrumented P2P emulation phase; observed metrics recorded separately from requested emulation',
      );
    } finally {
      await cdp.send('Network.emulateNetworkConditionsByRule', {
        matchedNetworkConditions: [],
      });
      await cdp.detach();
    }
    await expectVideo(viewer);
  }
  if (codecMatrix) {
    environment.videoCodecs = await host.evaluate(() =>
      RTCRtpSender.getCapabilities('video')?.codecs.map(
        (codec) => codec.mimeType,
      ),
    );
    await host.locator('#upload-budget').fill('40');
    await host.locator('#upload-budget').press('Tab');
    for (const codec of ['VP8', 'H264']) {
      if (
        !environment.videoCodecs?.some(
          (mime) => mime.toLowerCase() === `video/${codec}`.toLowerCase(),
        )
      )
        continue;
      await host.locator('[data-action=stop]').click();
      await expect(host.locator('#preferred-codec')).toBeEnabled();
      await host.locator('#preferred-codec').selectOption(codec);
      await expect(host.locator('#preferred-codec')).toBeEnabled();
      await startCapture(host);
      await expectVideo(viewer);
      await viewer.waitForTimeout(4000);
      recordQuality({
        profile: `codec-${codec}`,
        host: await qualitySnapshot(host),
        receiver: await collectQuality(viewer, 3000),
      });
    }
    checks.push(
      'Available VP8/H264 preferences negotiate real video; measurements recorded without hardware guarantees',
    );
  }
  for (let minute = 0; minute < soakMinutes; minute++) {
    await viewer.waitForTimeout(30_000);
    await expectVideo(viewer);
    await expectVideo(lateViewer);
    await viewer.waitForTimeout(30_000);
    recordQuality({
      profile: `soak-minute-${minute + 1}`,
      host: await qualitySnapshot(host),
      receiver: await collectQuality(viewer, 1000),
    });
  }
  if (soakMinutes)
    checks.push(
      `Completed ${soakMinutes} minute(s) of additional local two-viewer transmission`,
    );
  await host
    .getByRole('button', { name: 'Remover Amigo da sala', exact: true })
    .click();
  await expect(viewer.locator('.notice')).toContainText('removeu');
  await expect(viewer.locator('#stream-video')).toHaveCount(0);
  checks.push('Host removal stops the selected viewer');
  await host.locator('[data-action=leave]').click();
  await expect(lateViewer.locator('.notice')).toContainText('encerrou');
  await expect(lateViewer.locator('#stream-video')).toHaveCount(0);
  checks.push(
    'Closing the room stops capture and disconnects remaining viewers',
  );
  await join(viewer, code, 'Amigo').catch(async () => {
    await expect(viewer.locator('.notice')).toContainText('não encontrada');
  });
  await expect(viewer.locator('.room-code')).toHaveCount(0);
  checks.push('Closed room code no longer grants access');
  assert.deepEqual(errors, []);
  await writeFile(
    packaged
      ? codecMatrix
        ? 'test-results/smoke-packaged-codecs.json'
        : 'test-results/smoke-packaged.json'
      : 'test-results/smoke.json',
    JSON.stringify(
      {
        mode: packaged ? 'packaged' : 'development',
        checks,
        rendererErrors: errors,
        qualityPhases,
        environment,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} catch (error) {
  const snapshots = await Promise.all(
    pages.map((page) => qualitySnapshot(page).catch(() => null)),
  );
  await writeFile(
    'test-results/quality-failure.json',
    JSON.stringify(
      {
        error: String(error),
        qualityPhases,
        snapshots,
        environment,
        rendererErrors: errors,
      },
      null,
      2,
    ),
  );
  for (const [index, page] of pages.entries())
    await page
      .screenshot({ path: `test-results/failure-${index}.png` })
      .catch(() => {});
  throw error;
} finally {
  clearTimeout(deadline);
  await Promise.allSettled(
    applications.map((application) =>
      bounded(application.close(), 'Electron close', 5000).catch(() =>
        application.process().kill(),
      ),
    ),
  );
  await service.close();
}
