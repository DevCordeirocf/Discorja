import { _electron as electron, expect } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createSignalingServer } from '../dist/server/server.js';
import {
  appReady,
  copyInvite,
  createGroup,
  createRoom,
  openSettings,
  roomControls,
  trackRoomSockets,
} from './group-flow.mjs';

await mkdir('test-results', { recursive: true });
const profile = await mkdtemp(resolve('test-results/logs-profile-'));
const exportPath = join(profile, 'export.json');
const packaged = process.argv.includes('--packaged');
const serverLogs = [],
  checks = [];
const service = createSignalingServer({
  onLog: (entry) => serverLogs.push(entry),
});
const roomSockets = trackRoomSockets(service.wss);
await new Promise((done) => service.server.listen(0, '127.0.0.1', done));
const endpoint = `ws://127.0.0.1:${service.server.address().port}`;
const env = {
  ...process.env,
  DISCORJA_SIGNALING_URL: endpoint,
  DISCORJA_ICE_SERVERS: '[]',
};
delete env.ELECTRON_RUN_AS_NODE;
delete env.DISCORJA_DEV_URL;
let application, failure, logDirectory;
const deadline = setTimeout(() => application?.process().kill(), 90000);
async function launch() {
  application = await electron.launch({
    ...(packaged
      ? { executablePath: resolve('release/win-unpacked/Discorja.exe') }
      : {}),
    args: [...(packaged ? [] : ['.']), `--user-data-dir=${profile}`],
    env,
    timeout: 30000,
  });
  const page = await application.firstWindow();
  logDirectory = await application.evaluate(({ app }) =>
    app.getPath('userData'),
  );
  await appReady(page);
  return page;
}
async function records() {
  const text = await readFile(
    join(logDirectory, 'logs/discorja.log'),
    'utf8',
  ).catch(() => '');
  return text
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}
try {
  let page = await launch();
  await createGroup(page, {
    name: 'SyntheticLogUser',
    group: 'SyntheticLogGroup',
  });
  const invite = await copyInvite(application, page);
  await createRoom(page);
  const code = roomSockets.code('SyntheticLogUser');
  await expect
    .poll(async () =>
      (await records()).some((entry) => entry.event === 'room.created'),
    )
    .toBe(true);
  roomSockets.terminate('SyntheticLogUser');
  await expect
    .poll(
      async () =>
        (await records()).some((entry) => entry.event === 'signal.resumed'),
      { timeout: 10000 },
    )
    .toBe(true);
  checks.push(
    'Unexpected WebSocket closure and successful room resume are recorded without interaction',
  );

  await service.close();
  await expect(roomControls(page)).toHaveCount(0, { timeout: 25000 });
  await expect(page.locator('.notice')).toContainText(
    'Não foi possível retomar',
  );
  await expect
    .poll(async () =>
      (await records()).some(
        (entry) => entry.event === 'signal.recovery-failed',
      ),
    )
    .toBe(true);
  checks.push(
    'Unavailable signaling server leaves a persisted recovery deadline and visible explanation',
  );

  await page.evaluate(async () => {
    await window.discorja.recordLog({
      event: 'signal.closed',
      details: {
        code: 1006,
        token: 'SYNTHETIC_SECRET',
        message: 'SYNTHETIC_SECRET',
        url: 'wss://SYNTHETIC_SECRET',
      },
    });
    window.dispatchEvent(
      new ErrorEvent('error', {
        error: new TypeError('SYNTHETIC_SECRET'),
        lineno: 42,
        colno: 7,
      }),
    );
    await window.discorja.recordLog({
      event: 'app.exception',
      details: { line: 99999 },
    });
  });
  await application.evaluate(({ powerMonitor }) => {
    powerMonitor.emit('suspend');
    powerMonitor.emit('resume');
  });
  await openSettings(page, 'diagnostico');
  await application.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, exportPath);
  await page.locator('[data-action=export-logs]').click();
  await expect(page.locator('.notice')).toContainText('Logs salvos');
  let report = JSON.parse(await readFile(exportPath, 'utf8'));
  for (const expected of [
    'app.started',
    'room.created',
    'signal.closed',
    'signal.recovery-started',
    'signal.retry',
    'signal.resumed',
    'signal.recovery-failed',
    'renderer.error',
    'power.suspend',
    'power.resume',
  ])
    assert(
      report.records.some((entry) => entry.event === expected),
      `Missing event: ${expected}`,
    );
  assert(!report.records.some((entry) => entry.event === 'app.exception'));
  const groupSecrets = [invite, invite.slice(4), 'SyntheticLogGroup'];
  for (const secret of [
    'SYNTHETIC_SECRET',
    'SyntheticLogUser',
    endpoint,
    code,
    ...groupSecrets,
  ])
    assert(!JSON.stringify(report).includes(secret));
  checks.push(
    'Settings exports native logs and renderer failures while dropping free text, room codes, group invites, names and endpoints',
  );
  assert(serverLogs.some((entry) => entry.event === 'connection.closed'));
  for (const secret of [code, ...groupSecrets])
    assert(!JSON.stringify(serverLogs).includes(secret));
  checks.push(
    'Server closure log uses an independent room identifier without exporting the invite',
  );

  await application.close();
  application = undefined;
  page = await launch();
  await openSettings(page, 'diagnostico');
  await application.evaluate(({ dialog }, target) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: target });
  }, exportPath);
  await page.locator('[data-action=export-logs]').click();
  await expect(page.locator('.notice')).toContainText('Logs salvos');
  report = JSON.parse(await readFile(exportPath, 'utf8'));
  assert(report.records.some((entry) => entry.event === 'app.stopping'));
  assert(
    report.records.some((entry) => entry.event === 'signal.recovery-failed'),
  );
  assert.equal(
    new Set(
      report.records
        .filter((entry) => entry.event === 'app.started')
        .map((entry) => entry.runId),
    ).size,
    2,
  );
  checks.push(
    'Closing and reopening the app preserves the previous failure and identifies each run',
  );
} catch (error) {
  failure = error;
  console.error(error);
} finally {
  clearTimeout(deadline);
  await application?.close().catch(() => undefined);
  await service.close();
  await writeFile(
    packaged
      ? 'test-results/logs-smoke-packaged.json'
      : 'test-results/logs-smoke.json',
    JSON.stringify({ checks, failure: failure?.message }, null, 2),
  );
  console.log(JSON.stringify({ checks, failure: failure?.message }, null, 2));
}
if (failure) process.exitCode = 1;
