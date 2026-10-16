import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createSignalingServer } from '../dist/server/server.js';
import { installQualityProbe } from './quality-probe.mjs';

await mkdir('test-results', { recursive: true });
const service = createSignalingServer();
await new Promise((done) => service.server.listen(0, '127.0.0.1', done));
const applications = [],
  checks = [],
  errors = [];
const env = {
  ...process.env,
  DISCORJA_SIGNALING_URL: `ws://127.0.0.1:${service.server.address().port}`,
  DISCORJA_ICE_SERVERS: '[]',
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.DISCORJA_DEV_URL;
let failure;
const deadline = setTimeout(() => {
  for (const application of applications) application.process().kill();
}, 240000);

async function launch(name) {
  const profile = await mkdtemp(resolve('test-results/rooms-profile-'));
  const application = await electron.launch({
    args: ['.', `--user-data-dir=${profile}`],
    cwd: process.cwd(),
    env,
    timeout: 30000,
  });
  applications.push(application);
  const page = await application.firstWindow();
  page.on('pageerror', (error) => errors.push(error.message));
  await expect(page.locator('[data-action=create]')).toBeEnabled();
  await installQualityProbe(page);
  await page.evaluate(() => {
    window.__roomCaptureTracks = [];
    const original = navigator.mediaDevices.getDisplayMedia.bind(
      navigator.mediaDevices,
    );
    navigator.mediaDevices.getDisplayMedia = async (options) => {
      const stream = await original(options);
      window.__roomCaptureTracks.push(...stream.getTracks());
      return stream;
    };
  });
  await page.locator('#display-name').fill(name);
  return { application, page };
}
async function create(page) {
  await page.locator('[data-action=create]').click();
  await expect(page.locator('.room-code')).toBeVisible();
  return (await page.locator('.room-code').innerText()).replace(/\s/g, '');
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
  await page
    .locator('.source-option')
    .filter({ hasText: 'Discorja - janela de teste' })
    .click();
  await page.locator('[data-action=start-share]').click();
  await expect(page.locator('[data-action=stop]')).toBeVisible();
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
async function activePeers(page) {
  return page.evaluate(
    () =>
      window.__qualityProbe.peers.filter(
        (peer) => peer.connectionState !== 'closed',
      ).length,
  );
}
async function rooms(page) {
  await page.locator('nav [data-action=rooms]').click();
}
async function switchByCode(page, code) {
  await rooms(page);
  await page.locator('#switch-room-code').fill(code);
  await page
    .getByRole('button', { name: 'Entrar nesta sala', exact: true })
    .click();
  await expect(
    page.getByRole('heading', { name: 'Trocar de sala?' }),
  ).toBeVisible();
}

try {
  const { application: ownerApp, page: owner } = await launch('Dono');
  const first = await create(owner);
  const fixtureReady = ownerApp.waitForEvent('window');
  await ownerApp.evaluate(({ BrowserWindow }, fixturePath) => {
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
  await fixtureReady;
  const { page: friend } = await launch('Amigo');
  await join(friend, first);
  const { page: nextPublisher } = await launch('Publicador');
  await join(nextPublisher, first);
  const { page: otherOwner } = await launch('Outro dono');
  const second = await create(otherOwner);
  await capture(owner);
  await capture(otherOwner);
  await video(friend);
  await video(nextPublisher);
  checks.push('Two independent rooms exist; only the chosen room is received');
  await friend.evaluate(() => {
    window.__previousRoomStream =
      document.querySelector('#stream-video').srcObject;
    window.__previousRoomPeers = [...window.__qualityProbe.peers];
  });
  await switchByCode(friend, second);
  await friend.locator('[data-action=cancel-switch]').click();
  await friend.locator('[data-action=close-modal]').click();
  assert.equal(await activePeers(friend), 1);
  await video(friend);
  checks.push('Cancelling a switch preserves the current session and media');
  await switchByCode(friend, second);
  await friend.locator('[data-action=confirm-switch]').click();
  await expect(friend.locator('.room-code')).toContainText(second.slice(0, 4));
  await video(friend);
  assert.equal(
    await friend.evaluate(() =>
      window.__previousRoomPeers.every(
        (peer) => peer.connectionState === 'closed',
      ),
    ),
    true,
  );
  assert.equal(
    await friend.evaluate(() =>
      window.__previousRoomStream
        .getTracks()
        .every((track) => track.readyState === 'ended'),
    ),
    true,
  );
  assert.equal(await activePeers(friend), 1);
  await expect.poll(() => activePeers(owner)).toBe(1);
  await video(nextPublisher);
  checks.push(
    'Switch closes previous receivers and tracks; old publisher releases that connection while its other viewer continues',
  );
  await rooms(friend);
  await expect(friend.locator('.known-room')).toHaveCount(2);
  await friend.locator('[data-action=close-modal]').click();
  assert.equal(await activePeers(friend), 1);
  checks.push(
    'Saved rooms retain invitations only, without background connections or media',
  );
  await expect(
    nextPublisher.locator('[data-action=choose-source]'),
  ).toBeVisible();
  assert.equal(
    await nextPublisher.evaluate(() => window.__roomCaptureTracks.length),
    0,
  );
  checks.push(
    'Every participant may explicitly share; room membership never starts capture remotely',
  );
  await capture(nextPublisher);
  await owner
    .getByRole('button', {
      name: 'Assistir transmissão de Publicador',
      exact: true,
    })
    .click();
  await video(owner);
  await video(friend);
  checks.push(
    'A participant explicitly starts its screen; the room owner watches and the other room remains active',
  );
  await rooms(friend);
  await friend
    .locator(`[data-action=open-known-room][data-code="${first}"]`)
    .click();
  await friend.locator('[data-action=confirm-switch]').click();
  await video(friend);
  await expect.poll(() => activePeers(otherOwner)).toBe(0);
  await expect(otherOwner.locator('[data-action=stop]')).toBeVisible();
  checks.push(
    'Returning through a saved invitation creates a fresh membership and removes the inactive room connection',
  );
  await owner.locator('summary[aria-label="Ações de Amigo"]').click();
  await owner
    .getByRole('button', { name: 'Tornar moderador Amigo', exact: true })
    .click();
  await expect(
    friend.getByRole('button', {
      name: 'Encerrar tela de Dono',
      exact: true,
      includeHidden: true,
    }),
  ).toHaveCount(1);
  await expect(owner.locator('.member-menu[open]')).toHaveCount(1);
  await owner
    .getByRole('button', { name: 'Retirar moderação de Amigo', exact: true })
    .click();
  await expect(
    friend.getByRole('button', {
      name: 'Encerrar tela de Dono',
      exact: true,
    }),
  ).toHaveCount(0);
  checks.push(
    'Moderator controls appear and disappear following server authorization',
  );
  await rooms(owner);
  await owner.locator('#new-room-name').fill('Nova sala');
  await owner
    .getByRole('button', { name: 'Criar outra sala', exact: true })
    .click();
  await expect(owner.getByRole('dialog')).toContainText('encerrada para todos');
  await owner.locator('[data-action=confirm-switch]').click();
  await expect(
    owner.getByRole('heading', { name: 'Nova sala', exact: true }),
  ).toBeVisible();
  await expect(friend.locator('.room-code')).toHaveCount(0);
  await expect(nextPublisher.locator('.room-code')).toHaveCount(0);
  assert.equal(
    await nextPublisher.evaluate(() =>
      window.__roomCaptureTracks.every((track) => track.readyState === 'ended'),
    ),
    true,
  );
  await expect(otherOwner.locator('[data-action=stop]')).toBeVisible();
  checks.push(
    'Creating another room as owner closes the previous room for all and preserves unrelated rooms',
  );
  await join(friend, second);
  await video(friend);
  await switchByCode(friend, 'ABCDEFGH');
  await friend.locator('[data-action=confirm-switch]').click();
  await expect(
    friend
      .locator('.notice')
      .getByText('Sala não encontrada ou expirada.', { exact: true }),
  ).toBeVisible();
  await expect(friend.locator('#stream-video')).toHaveCount(0);
  assert.equal(await activePeers(friend), 0);
  await expect.poll(() => activePeers(otherOwner)).toBe(0);
  checks.push(
    'Failed destination leaves no residual media or background connection to the previous room',
  );
  await owner.screenshot({ path: 'test-results/rooms-owner.png' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} catch (error) {
  failure = String(error);
  throw error;
} finally {
  clearTimeout(deadline);
  await writeFile(
    'test-results/rooms-smoke.json',
    JSON.stringify({ checks, failure, rendererErrors: errors }, null, 2),
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
