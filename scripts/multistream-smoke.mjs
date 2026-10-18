import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createSignalingServer } from '../dist/server/server.js';
import { installQualityProbe } from './quality-probe.mjs';

await mkdir('test-results', { recursive: true });
// Keep the smoke run focused on a deliberately constrained capacity profile.
const service = createSignalingServer({ maxPublishers: 2 });
await new Promise((done) => service.server.listen(0, '127.0.0.1', done));
const applications = [],
  pages = [],
  checks = [],
  errors = [];
const measurements = {};
const soakMinutes = Number(
  process.argv
    .find((value) => value.startsWith('--soak-minutes='))
    ?.split('=')[1] ?? 0,
);
if (!Number.isInteger(soakMinutes) || soakMinutes < 0 || soakMinutes > 60)
  throw new Error('Use --soak-minutes=0..60.');
const env = {
  ...process.env,
  DISCORJA_SIGNALING_URL: `ws://127.0.0.1:${service.server.address().port}`,
  DISCORJA_ICE_SERVERS: '[]',
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.DISCORJA_DEV_URL;
let failure;
const deadline = setTimeout(
  () => applications.forEach((application) => application.process().kill()),
  300000 + soakMinutes * 60000,
);
async function launch(name) {
  const profile = await mkdtemp(resolve('test-results/multi-profile-'));
  const application = await electron.launch({
    args: ['.', `--user-data-dir=${profile}`],
    cwd: process.cwd(),
    env,
    timeout: 30000,
  });
  applications.push(application);
  const page = await application.firstWindow();
  pages.push(page);
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.locator('[data-action=create]')).toBeEnabled();
  await expect(page.locator('#startup-splash')).toHaveCount(0);
  await installQualityProbe(page);
  await page.evaluate(() => {
    window.__captureStreams = [];
    const original = navigator.mediaDevices.getDisplayMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getDisplayMedia = async (options) => {
      const stream = await original(options);
      window.__captureStreams.push(stream);
      return stream;
    };
  });
  await page.locator('#display-name').fill(name);
  return { application, page };
}
async function join(page, code) {
  await page.locator('#room-code').fill(code);
  await page
    .getByRole('button', { name: 'Entrar na sala', exact: true })
    .click();
  await expect(page.locator('.room-code')).toBeVisible();
}
async function capture(page) {
  await page.locator('[data-action=choose-source]').click();
  await page.getByRole('tab', { name: 'Guias' }).click();
  await page
    .locator('.source-option')
    .filter({ hasText: 'Discorja - piloto simultâneo' })
    .click();
  await page.locator('[data-action=start-share]').click();
  await expect(page.locator('[data-action=stop]')).toBeVisible();
}
async function video(page) {
  await expect
    .poll(
      () =>
        page
          .locator('#stream-video')
          .evaluate((element) => element.videoWidth)
          .catch(() => 0),
      { timeout: 20000 },
    )
    .toBeGreaterThan(0);
}
async function watch(page, name) {
  await page
    .getByRole('button', {
      name: `Assistir transmissão de ${name}`,
      exact: true,
    })
    .click();
  await video(page);
}
async function active(page, direction) {
  return page.evaluate(
    (filter) =>
      window.__qualityProbe.peers.filter(
        (peer) =>
          peer.connectionState !== 'closed' &&
          (!filter ||
            (filter === 'send'
              ? peer
                  .getSenders()
                  .some((sender) => sender.track?.kind === 'video')
              : !peer
                  .getSenders()
                  .some((sender) => sender.track?.kind === 'video'))),
      ).length,
    direction,
  );
}
async function receivedFrames(page) {
  return page.evaluate(async () => {
    let frames = 0;
    for (const peer of window.__qualityProbe.peers)
      if (peer.connectionState !== 'closed')
        for (const stat of (await peer.getStats()).values())
          if (stat.type === 'inbound-rtp' && stat.kind === 'video')
            frames += stat.framesDecoded ?? 0;
    return frames;
  });
}
async function rendererMemory(application, page) {
  const window = await application.browserWindow(page);
  const pid = await window.evaluate((window) =>
    window.webContents.getOSProcessId(),
  );
  return application.evaluate(({ app }, pid) => {
    return app.getAppMetrics().find((metric) => metric.pid === pid)?.memory;
  }, pid);
}

try {
  const { application: appA, page: a } = await launch('Ana');
  await a.locator('[data-action=create]').click();
  const code = (await a.locator('.room-code').innerText()).replace(/\s/g, '');
  const fixtureReady = appA.waitForEvent('window');
  await appA.evaluate(({ BrowserWindow }, fixturePath) => {
    const fixture = new BrowserWindow({
      width: 960,
      height: 560,
      frame: false,
      webPreferences: {
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,
      },
    });
    void fixture.loadFile(fixturePath);
  }, resolve('scripts/fixtures/motion.html'));
  const fixture = await fixtureReady;
  await expect(fixture).toHaveTitle('Discorja - janela de teste');
  await fixture.evaluate(() => {
    document.title = 'Discorja - piloto simultâneo';
  });
  const { page: b } = await launch('Bruno');
  await join(b, code);
  const { page: c } = await launch('Carla');
  await join(c, code);
  const { page: d } = await launch('Davi');
  await join(d, code);
  await a.locator('[data-action=settings]').click();
  await a.locator('#settings-quality-preset').selectOption('1080p60');
  await a.locator('[data-action=close-settings]').click();
  await capture(a);
  await capture(b);
  await expect(
    c.locator('.person-stream-choice[data-action=watch-screen]'),
  ).toHaveCount(2);
  assert.equal(await active(c), 0);
  assert.equal(await active(a, 'send'), 0);
  await expect(c.locator('#stream-video')).toHaveCount(0);
  await expect(c.locator('[data-action=choose-source]')).toBeDisabled();
  checks.push(
    'Two simultaneous publications; cards have no remote video or hidden subscriptions; pilot limit is visible',
  );
  await watch(c, 'Ana');
  await watch(d, 'Ana');
  await expect.poll(() => active(a, 'send')).toBe(2);
  await c.evaluate(() => {
    window.__oldWatchStream = document.querySelector('#stream-video').srcObject;
    window.__oldWatchPeers = [...window.__qualityProbe.peers];
  });
  await watch(c, 'Bruno');
  assert.equal(
    await c.evaluate(() =>
      window.__oldWatchStream
        .getTracks()
        .every((track) => track.readyState === 'ended'),
    ),
    true,
  );
  assert.equal(
    await c.evaluate(() =>
      window.__oldWatchPeers.every((peer) => peer.connectionState === 'closed'),
    ),
    true,
  );
  assert.equal(await active(c, 'receive'), 1);
  await expect.poll(() => active(a, 'send')).toBe(1);
  await expect.poll(() => active(b, 'send')).toBe(1);
  checks.push(
    'Switching selection closes the old tracks and peer; previous publisher stops that send while another viewer stays',
  );
  await watch(a, 'Bruno');
  await watch(b, 'Ana');
  assert.equal(await active(a, 'receive'), 1);
  assert.equal(await active(b, 'receive'), 1);
  await expect(a.locator('#local-preview')).toHaveCount(1);
  checks.push(
    'Two publishers can watch each other through independent send and receive connections',
  );

  measurements.memoryBeforeMinimize = await rendererMemory(appA, a);
  const framesBefore = await receivedFrames(d);
  const constraintsBefore = await a.evaluate(() =>
    window.__captureStreams[0].getVideoTracks()[0].getConstraints(),
  );
  const mainWindow = await appA.browserWindow(a);
  await mainWindow.evaluate((window) => window.minimize());
  await expect
    .poll(() =>
      a
        .locator('#local-preview')
        .evaluate((element) => element.srcObject === null && element.paused),
    )
    .toBe(true);
  await d.waitForTimeout(3000);
  measurements.receiverFramesDuringMinimize =
    (await receivedFrames(d)) - framesBefore;
  measurements.memoryDuringMinimize = await rendererMemory(appA, a);
  assert.ok(measurements.receiverFramesDuringMinimize > 15);
  assert.equal(
    await a.evaluate(
      () => window.__captureStreams[0].getVideoTracks()[0].readyState,
    ),
    'live',
  );
  assert.equal(
    await a.evaluate(
      () => window.__captureStreams[0].getVideoTracks()[0].enabled,
    ),
    true,
  );
  assert.deepEqual(
    await a.evaluate(() =>
      window.__captureStreams[0].getVideoTracks()[0].getConstraints(),
    ),
    constraintsBefore,
  );
  assert.equal(constraintsBefore.frameRate.max, 60);
  await mainWindow.evaluate((window) => {
    window.restore();
    window.show();
    window.focus();
  });
  await expect
    .poll(
      () =>
        a
          .locator('#local-preview')
          .evaluate(
            (element) =>
              element.srcObject === window.__captureStreams[0] &&
              !element.paused,
          ),
      { timeout: 10000 },
    )
    .toBe(true);
  // The automated Windows desktop does not reliably change OS focus on demand.
  // Native minimization above is real; emit these two lifecycle events to test wiring.
  await mainWindow.evaluate((window) => window.emit('blur'));
  await expect
    .poll(() =>
      a
        .locator('#local-preview')
        .evaluate((element) => element.srcObject === null && element.paused),
    )
    .toBe(true);
  await mainWindow.evaluate((window) => window.emit('focus'));
  await expect
    .poll(() =>
      a
        .locator('#local-preview')
        .evaluate(
          (element) =>
            element.srcObject === window.__captureStreams[0] && !element.paused,
        ),
    )
    .toBe(true);
  checks.push(
    'Minimizing detaches and pauses only local preview; remote frames keep arriving with the same live 60fps capture constraints; foreground reuses the stream',
  );
  await a.screenshot({ path: 'test-results/multistream-room.png' });
  await c.screenshot({ path: 'test-results/multistream-viewer.png' });
  if (soakMinutes) {
    const started = Date.now();
    measurements.soak = [];
    let frames = await receivedFrames(d),
      last = started;
    while (Date.now() - started < soakMinutes * 60000) {
      await d.waitForTimeout(
        Math.min(20000, soakMinutes * 60000 - (Date.now() - started)),
      );
      const current = await receivedFrames(d),
        now = Date.now();
      assert.ok(
        current > frames,
        'Selected reception must keep decoding frames',
      );
      assert.equal(await active(c, 'receive'), 1);
      assert.equal(await active(d, 'receive'), 1);
      assert.equal(await active(a, 'send'), 2);
      assert.equal(await active(b, 'send'), 2);
      measurements.soak.push({
        elapsedSeconds: (now - started) / 1000,
        measuredReceiverFps: ((current - frames) * 1000) / (now - last),
        publisherMemory: await rendererMemory(appA, a),
      });
      frames = current;
      last = now;
      console.log(
        `Piloto P2P local: ${Math.round((now - started) / 1000)} segundos; conexões e vídeo ativos.`,
      );
    }
    measurements.soakDurationSeconds = (Date.now() - started) / 1000;
    checks.push(
      `Sustained two-publication local pilot for ${soakMinutes} minute(s), with bounded active peers and ongoing receiver frames`,
    );
  }
  await b.locator('[data-action=stop]').click();
  await expect(c.locator('#stream-video')).toHaveCount(0);
  await expect(
    d.locator('.person-stream-choice[data-action=watch-screen]'),
  ).toHaveCount(1);
  const surviving = await receivedFrames(d);
  await d.waitForTimeout(1200);
  assert.ok((await receivedFrames(d)) > surviving);
  await expect(a.locator('[data-action=stop]')).toBeVisible();
  checks.push(
    'Stopping Bruno removes only his publication; Ana continues transmitting and Davi continues receiving',
  );
  await a
    .locator('[data-action=stop-watching]')
    .count()
    .then(async (count) => {
      if (count) await a.locator('[data-action=stop-watching]').click();
    });
  await capture(c);
  await expect(
    a.locator('.person-stream-choice[data-action=watch-screen]'),
  ).toHaveCount(2);
  await a.locator('summary[aria-label="Ações de Carla"]').click();
  await a
    .getByRole('button', { name: 'Encerrar tela de Carla', exact: true })
    .click();
  await expect(c.locator('[data-action=stop]')).toHaveCount(0);
  await expect(a.locator('[data-action=stop]')).toBeVisible();
  checks.push(
    'Moderator interruption of a publication does not end the other publication or the room',
  );
  await d.locator('[data-action=stop-watching]').click();
  await expect.poll(() => active(d)).toBe(0);
  checks.push('Stop watching releases reception without affecting membership');
  await a.locator('[data-action=leave]').click();
  for (const page of [b, c, d])
    await expect(page.locator('.room-code')).toHaveCount(0);
  assert.equal(
    await a.evaluate(() =>
      window.__captureStreams.every((stream) =>
        stream.getTracks().every((track) => track.readyState === 'ended'),
      ),
    ),
    true,
  );
  assert.deepEqual(errors, []);
  checks.push('Room closure ends every publication and viewer session');
  console.log(
    JSON.stringify({ passed: checks.length, checks, measurements }, null, 2),
  );
} catch (error) {
  failure = String(error);
  for (const [index, page] of pages.entries())
    await page
      .screenshot({ path: `test-results/multi-failure-${index}.png` })
      .catch(() => {});
  throw error;
} finally {
  clearTimeout(deadline);
  await writeFile(
    'test-results/multistream-smoke.json',
    JSON.stringify(
      { checks, failure, rendererErrors: errors, measurements },
      null,
      2,
    ),
  );
  await Promise.allSettled(
    applications.map(async (application) => {
      const timer = setTimeout(() => application.process().kill(), 5000);
      try {
        await application.close();
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  await service.close();
}
