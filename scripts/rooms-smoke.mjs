import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createSignalingServer } from '../dist/server/server.js';
import { installQualityProbe } from './quality-probe.mjs';
import {
  appReady,
  backToRoom,
  copyInvite,
  createGroup,
  createRoom,
  currentRoom,
  ensureWatching,
  joinGroup,
  joinRoom,
  requestRoom,
  roomControls,
  showGroup,
} from './group-flow.mjs';

await mkdir('test-results', { recursive: true });
const service = createSignalingServer();
await new Promise((done) => service.server.listen(0, '127.0.0.1', done));
const applications = [],
  pages = [],
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

let invite;
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
  pages.push(page);
  page.on('pageerror', (error) => errors.push(error.message));
  await appReady(page);
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
  // The first app creates the group; every other one enters with its invite.
  if (invite) await joinGroup(page, { name, invite });
  else {
    await createGroup(page, { name, group: 'Turma das salas' });
    invite = await copyInvite(application, page);
  }
  return { application, page };
}
/** Creates a room in the group; rooms are named after their owner. */
async function create(page, owner) {
  await createRoom(page);
  await expect(currentRoom(page)).toHaveText(`Sala de ${owner}`);
  return `Sala de ${owner}`;
}
const join = joinRoom;
async function capture(page) {
  await page.locator('[data-action=choose-source]').click();
  await page.getByRole('tab', { name: 'Guias' }).click();
  await page
    .locator('.source-option')
    .filter({ hasText: 'Discorja - janela de teste' })
    .click();
  await page.locator('[data-action=start-share]').click();
  await expect(page.locator('[data-action=stop]')).toBeVisible();
}
async function video(page) {
  await ensureWatching(page);
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
async function leave(page) {
  await page.locator('[data-action=leave]').click();
  await expect(page.locator('[data-action=create-group-room]')).toBeVisible();
  await expect(roomControls(page)).toHaveCount(0);
}
async function requestSwitchFromHome(page, roomName) {
  await requestRoom(page, roomName);
  await expect(
    page.getByRole('heading', { name: 'Trocar de sala?' }),
  ).toBeVisible();
}

try {
  const { application: ownerApp, page: owner } = await launch('Dono');
  const first = await create(owner, 'Dono');
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
  const second = await create(otherOwner, 'Outro dono');
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
  await leave(friend);
  await join(friend, second);
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
  assert.equal(await activePeers(friend), 0);
  await video(friend);
  checks.push('Leaving returns to the main menu before joining another room');
  await requestSwitchFromHome(friend, first);
  await friend.locator('[data-action=cancel-switch]').click();
  await backToRoom(friend);
  await expect(currentRoom(friend)).toHaveText(second);
  await video(friend);
  assert.equal(await activePeers(friend), 1);
  checks.push('Cancelling a switch keeps the active room and its media');
  await requestSwitchFromHome(friend, first);
  await friend.locator('[data-action=confirm-switch]').click();
  await expect(currentRoom(friend)).toHaveText(first);
  await video(friend);
  assert.equal(await activePeers(friend), 1);
  checks.push('Confirmed replacement still closes the prior room session');
  await expect.poll(() => activePeers(otherOwner)).toBe(0);
  await expect.poll(() => activePeers(owner)).toBe(2);
  await video(nextPublisher);
  checks.push(
    'Switch closes previous receivers and tracks; the left room publisher releases that connection while the destination publisher keeps its other viewer',
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
  await leave(owner);
  await expect(roomControls(friend)).toHaveCount(0);
  await expect(roomControls(nextPublisher)).toHaveCount(0);
  await create(owner, 'Dono');
  await expect(roomControls(friend)).toHaveCount(0);
  await expect(roomControls(nextPublisher)).toHaveCount(0);
  assert.equal(
    await nextPublisher.evaluate(() =>
      window.__roomCaptureTracks.every((track) => track.readyState === 'ended'),
    ),
    true,
  );
  await expect(otherOwner.locator('[data-action=stop]')).toBeVisible();
  checks.push(
    'The owner can leave from the room controls; other rooms stay active',
  );
  await join(friend, second);
  await video(friend);
  await leave(friend);
  // A listed room may close before the click arrives; point one card at a code
  // the server does not know to exercise that stale destination.
  await showGroup(friend);
  await friend
    .locator('[data-action=join-group-room]:not([disabled])')
    .first()
    .evaluate((button) => {
      button.dataset.code = 'ABCDEFGH';
      button.click();
    });
  await expect(
    friend
      .locator('.notice')
      .getByText('Sala não encontrada ou expirada.', { exact: true }),
  ).toBeVisible();
  await expect(friend.locator('#stream-video')).toHaveCount(0);
  assert.equal(await activePeers(friend), 0);
  await expect.poll(() => activePeers(otherOwner)).toBe(0);
  checks.push(
    'Failed destination from the main menu leaves no media or room connection',
  );
  await owner.screenshot({ path: 'test-results/rooms-owner.png' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} catch (error) {
  failure = String(error);
  for (const [index, page] of pages.entries())
    await page
      .screenshot({ path: `test-results/rooms-failure-${index}.png` })
      .catch(() => {});
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
