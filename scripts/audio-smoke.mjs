import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createSignalingServer } from '../dist/server/server.js';
import { installQualityProbe } from './quality-probe.mjs';

// Real Chromium audio capture/Opus/WebRTC, using only a generated test window.
// audio-main.cjs substitutes that frame for Windows loopback AFTER production
// authorization. Native WASAPI, physical devices and Discord require manual QA.
const soakMinutes = Number(
  process.argv
    .find((arg) => arg.startsWith('--soak-minutes='))
    ?.split('=')[1] ?? 0,
);
if (!Number.isFinite(soakMinutes) || soakMinutes < 0 || soakMinutes > 60)
  throw new Error('Use --soak-minutes=0..60.');
await mkdir('test-results', { recursive: true });
const service = createSignalingServer();
await new Promise((done) => service.server.listen(0, '127.0.0.1', done));
const applications = [];
const checks = [];
const errors = [];
const samples = [];
let failure;
const deadline = setTimeout(
  () => {
    console.error('Tempo máximo do ensaio de áudio excedido.');
    for (const application of applications) application.process().kill();
  },
  (soakMinutes + 5) * 60000,
);
const env = {
  ...process.env,
  DISCORJA_SIGNALING_URL: `ws://127.0.0.1:${service.server.address().port}`,
  DISCORJA_ICE_SERVERS: '[]',
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.DISCORJA_DEV_URL;

async function launch(testCapture = false) {
  const profile = await mkdtemp(resolve('test-results/audio-profile-'));
  const application = await electron.launch({
    args: [
      testCapture ? 'scripts/fixtures/audio-main.cjs' : '.',
      `--user-data-dir=${profile}`,
    ],
    env,
    cwd: process.cwd(),
    timeout: 30000,
  });
  applications.push(application);
  const page = await application.firstWindow();
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.locator('[data-action=create]')).toBeEnabled();
  await installQualityProbe(page);
  await page.evaluate(() => {
    const original = navigator.mediaDevices.getDisplayMedia.bind(
      navigator.mediaDevices,
    );
    window.__audioTestTracks = [];
    navigator.mediaDevices.getDisplayMedia = async (options) => {
      if (window.__audioTestMode === 'denied')
        throw new DOMException(
          'Permissão recusada no ensaio',
          'NotAllowedError',
        );
      const stream = await original(options);
      window.__audioTestTracks.push(...stream.getTracks());
      if (window.__audioTestMode === 'missing') {
        for (const track of stream.getAudioTracks()) {
          stream.removeTrack(track);
          track.stop();
        }
      }
      return stream;
    };
  });
  return { application, page };
}

async function start(host, audio = true) {
  await host.locator('[data-action=choose-source]').click();
  await host
    .locator('.source-option')
    .filter({ hasText: 'Discorja - teste de som' })
    .click();
  await expect(host.locator('#include-system-audio')).not.toBeChecked();
  if (audio) {
    await host.locator('#include-system-audio').check();
    await expect(host.locator('[data-action=start-share]')).toBeDisabled();
    await host.locator('#accept-audio-scope').check();
  }
  await host.locator('[data-action=start-share]').click();
}

async function video(page) {
  if (!(await page.locator('[data-action=stop-watching]').count())) {
    const watch = page.locator('[data-action=watch-screen]').first();
    await expect(watch).toBeVisible();
    await watch.click();
  }
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

async function audioProbe(page) {
  await page.evaluate(async () => {
    await window.__audioProbe?.context.close();
    const stream = document.querySelector('#stream-video').srcObject;
    const context = new AudioContext();
    const source = context.createMediaStreamSource(stream);
    const analyser = context.createAnalyser();
    analyser.fftSize = 2048;
    const silent = context.createGain();
    silent.gain.value = 0;
    source.connect(analyser).connect(silent).connect(context.destination);
    await context.resume();
    window.__audioProbe = { context, analyser };
  });
}

async function sample(page) {
  return page.evaluate(async () => {
    const element = document.querySelector('#stream-video');
    const analyser = window.__audioProbe?.analyser;
    const values = new Float32Array(analyser?.fftSize ?? 0);
    analyser?.getFloatTimeDomainData(values);
    let energy = 0;
    for (const value of values) energy += value * value;
    const stats = [];
    for (const pc of window.__qualityProbe.peers) {
      if (pc.connectionState === 'closed') continue;
      for (const stat of (await pc.getStats()).values()) {
        if (stat.type !== 'inbound-rtp') continue;
        stats.push({
          kind: stat.kind,
          bytes: stat.bytesReceived,
          frames: stat.framesDecoded,
          samples: stat.totalSamplesReceived,
          concealed: stat.concealedSamples,
          jitter: stat.jitter,
          syncSources: stat.estimatedPlayoutTimestamp,
        });
      }
    }
    return {
      timestamp: Date.now(),
      rms: values.length ? Math.sqrt(energy / values.length) : 0,
      audioTracks: element.srcObject.getAudioTracks().length,
      videoTracks: element.srcObject.getVideoTracks().length,
      muted: element.muted,
      volume: element.volume,
      playing: !element.paused,
      stats,
    };
  });
}

try {
  const { application: hostApp, page: host } = await launch(true);
  const fixtureReady = hostApp.waitForEvent('window');
  await hostApp.evaluate(({ BrowserWindow }, fixturePath) => {
    const fixture = new BrowserWindow({
      width: 700,
      height: 480,
      show: true,
      webPreferences: {
        sandbox: true,
        nodeIntegration: false,
        contextIsolation: true,
        backgroundThrottling: false,
      },
    });
    globalThis.audioTestWindow = fixture;
    void fixture.loadFile(fixturePath);
  }, resolve('scripts/fixtures/audio.html'));
  const fixture = await fixtureReady;
  await fixture.locator('#prepare').click();
  for (const constraint of [
    { audio: true },
    { video: true },
    { video: true, audio: true },
  ]) {
    const result = await host.evaluate(async (options) => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia(options);
        stream.getTracks().forEach((track) => track.stop());
        return 'granted';
      } catch (error) {
        return error.name;
      }
    }, constraint);
    assert.notEqual(result, 'granted');
  }
  checks.push('Microphone and camera denied');
  assert.equal(
    await host.evaluate(async () => {
      const sources = await window.discorja.getSources();
      const source = sources.find(
        (item) => item.name === 'Discorja - teste de som',
      );
      await window.discorja.selectSource(source.id, true);
      try {
        const microphone = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        microphone.getTracks().forEach((track) => track.stop());
        return false;
      } catch {
        return true;
      } finally {
        await window.discorja.cancelCapture();
      }
    }),
    true,
  );
  checks.push('Pending system-audio consent does not authorize microphone');
  await host.locator('#display-name').fill('Teste de som');
  await host.locator('[data-action=create]').click();
  const code = (await host.locator('.room-code').innerText()).replace(
    /\s/g,
    '',
  );
  const { page: viewer } = await launch();
  await viewer.locator('#display-name').fill('Receptor');
  await viewer.locator('#room-code').fill(code);
  await viewer
    .getByRole('button', { name: 'Entrar na sala', exact: true })
    .click();
  await expect(viewer.locator('.room-code')).toBeVisible();
  await start(host);
  await expect(host.locator('[data-action=stop]')).toBeVisible();
  await video(viewer);
  await fixture.evaluate(() => window.startTone());
  assert.deepEqual(await hostApp.evaluate(() => globalThis.audioTestGrant), {
    requested: true,
    granted: 'loopback',
  });
  await expect(
    viewer.locator('[data-action=toggle-receive-audio]'),
  ).toBeVisible();
  assert.equal(
    await host.locator('#stream-video').evaluate((element) => element.muted),
    true,
  );
  assert.equal(
    await viewer.locator('#stream-video').evaluate((element) => element.muted),
    true,
  );
  await audioProbe(viewer);
  await expect
    .poll(async () => (await sample(viewer)).rms, { timeout: 15000 })
    .toBeGreaterThan(0.002);
  let current = await sample(viewer);
  assert.equal(current.audioTracks, 1);
  assert.equal(current.videoTracks, 1);
  checks.push(
    'Explicit consent grants loopback; isolated test frame arrives as one audio and one video track',
  );
  checks.push(
    'Local preview and initial receiver playback muted, without duplicate audio elements',
  );

  // Exercise playback without audible sound on the developer computer.
  await viewer.locator('#receive-volume').fill('0');
  await viewer.locator('[data-action=toggle-receive-audio]').click();
  assert.equal((await sample(viewer)).muted, false);
  assert.equal((await sample(viewer)).volume, 0);
  await viewer.locator('[data-action=toggle-receive-audio]').click();
  await viewer.locator('#receive-volume').fill('37');
  await host.locator('[data-action=copy]').click();
  assert.equal((await sample(viewer)).volume, 0.37);
  checks.push(
    'Receiver can play, mute and adjust volume while host preview stays muted',
  );

  await host.locator('[data-action=toggle-send-audio]').click();
  await expect
    .poll(async () => (await sample(viewer)).rms)
    .toBeLessThan(0.0005);
  await video(viewer);
  await host.locator('[data-action=toggle-send-audio]').click();
  await expect
    .poll(async () => (await sample(viewer)).rms)
    .toBeGreaterThan(0.002);
  checks.push(
    'Host mute sends silence; reactivation restores sound without replacing the video',
  );

  await fixture.evaluate(() => window.silenceTone(true));
  await expect
    .poll(async () => (await sample(viewer)).rms)
    .toBeLessThan(0.0005);
  await fixture.evaluate(() => window.silenceTone(false));
  await expect
    .poll(async () => (await sample(viewer)).rms)
    .toBeGreaterThan(0.002);
  checks.push('Silent source and resumed source preserve the connection');
  await host.evaluate(() =>
    navigator.mediaDevices.dispatchEvent(new Event('devicechange')),
  );
  await expect(
    host.getByText(/Os dispositivos de áudio mudaram/),
  ).toBeVisible();
  checks.push('Device-change notification does not start a new capture');

  await host.locator('[data-action=toggle-send-audio]').click();
  [...service.wss.clients][0].terminate();
  await expect(host.locator('.notice')).toContainText('recuperada', {
    timeout: 15000,
  });
  await video(viewer);
  await audioProbe(viewer);
  await expect
    .poll(async () => (await sample(viewer)).rms)
    .toBeLessThan(0.0005);
  assert.equal((await sample(viewer)).volume, 0.37);
  assert.equal(
    await host.evaluate(() =>
      window.__audioTestTracks
        .filter(
          (track) => track.kind === 'audio' && track.readyState === 'live',
        )
        .every((track) => !track.enabled),
    ),
    true,
  );
  await host.locator('[data-action=toggle-send-audio]').click();
  await expect
    .poll(async () => (await sample(viewer)).rms)
    .toBeGreaterThan(0.002);
  checks.push(
    'Signaling recovery preserves audio consent and the muted state, without duplicate tracks',
  );

  for (let minute = 0; minute < soakMinutes; minute++) {
    const before = await sample(viewer);
    await viewer.waitForTimeout(60000);
    const after = await sample(viewer);
    const audioBefore = before.stats.find((stat) => stat.kind === 'audio');
    const audioAfter = after.stats.find((stat) => stat.kind === 'audio');
    const videoBefore = before.stats.find((stat) => stat.kind === 'video');
    const videoAfter = after.stats.find((stat) => stat.kind === 'video');
    assert.equal(after.audioTracks, 1);
    assert.equal(after.videoTracks, 1);
    assert.equal(after.volume, 0.37);
    assert.ok(
      audioAfter.bytes > audioBefore.bytes &&
        videoAfter.frames > videoBefore.frames,
    );
    assert.ok(after.rms > 0.002);
    samples.push(after);
    console.log(`Áudio e vídeo ativos: ${minute + 1}/${soakMinutes} minutos.`);
  }
  await host.screenshot({ path: 'test-results/audio-host.png' });
  await viewer.screenshot({ path: 'test-results/audio-viewer.png' });
  await host.locator('[data-action=stop-audio]').click();
  await expect
    .poll(async () => (await sample(viewer)).rms)
    .toBeLessThan(0.0005);
  assert.equal(
    await host.evaluate(() =>
      window.__audioTestTracks
        .filter((track) => track.kind === 'audio')
        .every((track) => track.readyState === 'ended'),
    ),
    true,
  );
  await video(viewer);
  checks.push(
    'Stopping only audio ends capture tracks and preserves screen video',
  );
  await host.locator('[data-action=stop]').click();
  await expect(viewer.locator('#stream-video')).toHaveCount(0);

  await start(host, false);
  await video(viewer);
  assert.equal((await sample(viewer)).audioTracks, 0);
  checks.push(
    'Video-only remains available and selection never remembers audio consent',
  );
  await host.locator('[data-action=stop]').click();
  await host.evaluate(() => {
    window.__audioTestMode = 'missing';
  });
  await start(host);
  await video(viewer);
  await expect(host.getByText(/O Windows não forneceu som/)).toBeVisible();
  assert.equal((await sample(viewer)).audioTracks, 0);
  checks.push(
    'Missing audio track continues with video and an explicit warning',
  );
  await host.locator('[data-action=stop]').click();
  await host.evaluate(() => {
    window.__audioTestMode = 'denied';
  });
  await start(host);
  await expect(host.locator('[data-action=stop]')).toHaveCount(0);
  await expect(
    host.locator('.notice').getByText(/O compartilhamento foi cancelado/),
  ).toBeVisible();
  checks.push('Permission denial leaves capture stopped');
  await host.evaluate(() => {
    window.__audioTestMode = undefined;
  });
  await start(host);
  await video(viewer);
  await host.evaluate(() => {
    const track = window.__audioTestTracks.findLast(
      (item) => item.kind === 'audio',
    );
    track.stop();
    track.dispatchEvent(new Event('ended'));
  });
  await expect(
    host.getByText(/A captura de som foi interrompida/),
  ).toBeVisible();
  await video(viewer);
  checks.push(
    'Ended audio source warns and detaches sender while video remains active',
  );
  await host.locator('[data-action=stop]').click();
  await start(host);
  await video(viewer);
  await host.locator('nav [data-action=rooms]').click();
  await host.locator('#new-room-name').fill('Outra sala de áudio');
  await host
    .getByRole('button', { name: 'Criar outra sala', exact: true })
    .click();
  await host.locator('[data-action=confirm-switch]').click();
  await expect(
    host.getByRole('heading', { name: 'Outra sala de áudio', exact: true }),
  ).toBeVisible();
  assert.equal(
    await host.evaluate(() =>
      window.__audioTestTracks.every((track) => track.readyState === 'ended'),
    ),
    true,
  );
  checks.push(
    'Switching rooms ends all audio and video tracks without starting a new capture',
  );
  await expect(viewer.locator('.room-code')).toHaveCount(0);
  checks.push(
    'Room closure removes playback and ends all local capture tracks',
  );
  assert.equal(
    await host.evaluate(() =>
      window.__audioTestTracks.every((track) => track.readyState === 'ended'),
    ),
    true,
  );
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: checks.length, checks }));
} catch (error) {
  failure = String(error);
  throw error;
} finally {
  clearTimeout(deadline);
  await writeFile(
    'test-results/audio-smoke.json',
    JSON.stringify(
      {
        checks,
        failure,
        rendererErrors: errors,
        samples,
        soakMinutes,
        capture:
          'isolated-generated-frame; not native Windows loopback or Discord',
      },
      null,
      2,
    ),
  );
  await Promise.allSettled(
    applications.map((application) => application.close()),
  );
  await service.close();
}
