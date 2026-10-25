import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createSignalingServer } from '../dist/server/server.js';
import {
  appReady,
  copyInvite,
  createGroup,
  createRoom,
  joinGroup,
  joinRoom,
  openSettings,
} from './group-flow.mjs';

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
const deadline = setTimeout(
  () => applications.forEach((app) => app.process().kill()),
  180000,
);
async function launch() {
  const profile = await mkdtemp(resolve('test-results/accessibility-profile-'));
  const app = await electron.launch({
    args: ['.', `--user-data-dir=${profile}`],
    env,
    timeout: 30000,
  });
  applications.push(app);
  const page = await app.firstWindow();
  page.on('pageerror', (error) => errors.push(error.message));
  await appReady(page);
  await expect(page.locator('#startup-splash')).toHaveCount(0);
  return { app, page };
}
async function join(name, invite) {
  const { page } = await launch();
  await joinGroup(page, { name, invite });
  await joinRoom(page, 'Sala de Ana');
  return page;
}
async function redraw(app, page) {
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].webContents.send('updates:state', {
      status: 'disabled',
    }),
  );
  await expect(page.locator('[data-action=toggle-profile-menu]')).toBeVisible();
}
try {
  const { app, page } = await launch();
  await page.locator('.skip-link').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#main-content')).toBeFocused();
  checks.push('Keyboard skip link reaches the main landmark');
  const groupName = page.locator(
    '[data-group-form=create] [data-group-field=name]',
  );
  await groupName.fill('Turma');
  await groupName.focus();
  await groupName.evaluate((input) => input.setSelectionRange(1, 2));
  await redraw(app, page);
  await expect(groupName).toBeFocused();
  assert.deepEqual(
    await groupName.evaluate((input) => [
      input.selectionStart,
      input.selectionEnd,
    ]),
    [1, 2],
  );
  checks.push('Structural updates preserve input focus and caret selection');
  await createGroup(page, { name: 'Ana', group: 'Turma' });
  const invite = await copyInvite(app, page);
  await createRoom(page);
  await join('Bruno', invite);
  const menu = page.locator('summary[aria-label="Ações de Bruno"]');
  await menu.focus();
  await page.keyboard.press('Enter');
  await page
    .getByRole('button', { name: 'Tornar moderador Bruno', exact: true })
    .focus();
  await join('Carla', invite);
  await expect(
    page.getByRole('button', { name: 'Tornar moderador Bruno', exact: true }),
  ).toBeFocused();
  await expect(page.locator('.member-menu[open]')).toHaveCount(1);
  checks.push(
    'A new room snapshot preserves the focused participant action and open menu',
  );
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await expect(page.locator('.member-menu[open]')).toHaveCount(0);
  checks.push(
    'Escape closes participant controls and returns focus to their summary',
  );
  await openSettings(page);
  await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(940, 700),
  );
  await expect(page.locator('#settings-quality-preset')).toBeVisible();
  await expect(page.locator('.settings-advanced')).toHaveCount(0);
  await expect(
    page.locator('#setting-resolution, #setting-fps, #setting-content'),
  ).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator('.settings-page')
        .evaluate(
          (element) => element.scrollHeight <= element.clientHeight + 1,
        ),
    )
    .toBe(true);
  await expect
    .poll(() =>
      page
        .locator('.settings-main')
        .evaluate(
          (element) => element.scrollHeight <= element.clientHeight + 1,
        ),
    )
    .toBe(true);
  checks.push(
    'Transmission quality is shown once, without a collapsed advanced section',
  );
  // Resolution and frame rate are separate controls; the per-viewer default
  // follows the resolution profile.
  await page.locator('#settings-quality-preset').selectOption('720p30');
  await expect(page.locator('#settings-video-bitrate')).toHaveValue('4');
  await page.locator('#settings-quality-preset').selectOption('1080p30');
  await page.locator('#settings-fps').selectOption('120');
  await expect(page.locator('#settings-fps')).toHaveValue('120');
  await expect(page.locator('#settings-video-bitrate')).toHaveValue('8');
  await expect(page.locator('#settings-upload-budget')).toHaveAttribute(
    'max',
    '500',
  );
  await expect(page.locator('#settings-video-bitrate')).toHaveAttribute(
    'max',
    '100',
  );
  await page.locator('#settings-fps').selectOption('60');
  await page.locator('#settings-fps').focus();
  await page.locator('#settings-fps').selectOption('60');
  await expect(page.locator('#settings-fps')).toHaveValue('60');
  await expect(page.locator('#settings-video-bitrate')).toHaveValue('8');
  await page.locator('#settings-video-bitrate').fill('24');
  await page.locator('#settings-video-bitrate').press('Tab');
  await expect(page.locator('#settings-video-bitrate-help')).toContainText(
    '3 MB/s',
  );
  await expect(page.locator('#settings-video-bitrate-help')).toContainText(
    'Personalizado',
  );
  await page.locator('#settings-video-bitrate').fill('8');
  await page.locator('#settings-video-bitrate').press('Tab');
  await expect(page.locator('#settings-video-bitrate')).toHaveValue('8');
  await expect(page.locator('#settings-video-bitrate-help')).toContainText(
    'Padrão do perfil',
  );
  checks.push(
    'Per-viewer bitrate and MB/s hint can be changed and returned to the profile default',
  );
  await page.locator('.rail [data-action=room]').click();
  await page.locator('.video-stage').hover();
  await page.locator('[data-action=show-diagnostics]').focus();
  await page.locator('[data-action=show-diagnostics]').click();
  await expect(page.locator('.app-shell')).toHaveAttribute('inert', '');
  await page.locator('[role=dialog]').evaluate((dialog) => {
    const select = document.createElement('select');
    select.id = 'test-dialog-select';
    select.innerHTML = '<option>Keyboard test fixture</option>';
    dialog.append(select);
  });
  await page.locator('#test-dialog-select').focus();
  await page.keyboard.press('Tab');
  await expect(
    page.getByRole('button', {
      name: 'Fechar diagnóstico',
      exact: true,
    }),
  ).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.locator('#test-dialog-select')).toBeFocused();
  checks.push(
    'Modal keyboard navigation includes selects, wraps in both directions and excludes background controls',
  );
  await page.keyboard.press('Escape');
  await expect(page.locator('[role=dialog]')).toHaveCount(0);
  checks.push('Escape closes the diagnostics dialog');
  await page.evaluate(() => {
    window.__announcer = document.querySelector('#session-announcement');
    window.__announcements = 0;
    new MutationObserver(() => window.__announcements++).observe(
      window.__announcer,
      { childList: true },
    );
  });
  await redraw(app, page);
  await redraw(app, page);
  assert.equal(
    await page.evaluate(
      () =>
        window.__announcer === document.querySelector('#session-announcement'),
    ),
    true,
  );
  assert.equal(await page.evaluate(() => window.__announcements), 0);
  checks.push(
    'Live session announcements persist and do not repeat for unchanged state',
  );
  await page.screenshot({ path: 'test-results/accessibility-room.png' });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: checks.length, checks }, null, 2));
} catch (error) {
  failure = String(error);
  throw error;
} finally {
  clearTimeout(deadline);
  await writeFile(
    'test-results/accessibility-smoke.json',
    JSON.stringify({ checks, failure, errors }, null, 2),
  );
  await Promise.allSettled(
    applications.map(async (app) => {
      const timer = setTimeout(() => app.process().kill(), 5000);
      try {
        await app.close();
      } finally {
        clearTimeout(timer);
      }
    }),
  );
  await service.close();
}
