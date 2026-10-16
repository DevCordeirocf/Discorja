import { _electron as electron, expect } from '@playwright/test';
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { readFile, mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import yaml from 'js-yaml';

// Exercises the actual updater and packaged UI against a local fixture provider.
// Never executes an installer or changes a user's existing installation.
await mkdir('test-results', { recursive: true });
const metadata = yaml.load(await readFile('release/latest.yml', 'utf8'));
const installer = resolve('release', metadata.files[0].url);
const parts = metadata.version.split('.').map(Number);
assert.ok(parts.length === 3 && parts.every(Number.isInteger));
const nextVersion = `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
const hash = createHash('sha512')
  .update(await readFile(installer))
  .digest('base64');
assert.equal(hash, metadata.files[0].sha512);
const applications = [];
let scenario = 'current';
const server = createServer((req, res) => {
  if (scenario === 'offline') {
    req.socket.destroy();
    return;
  }
  if (new URL(req.url, 'http://localhost').pathname === '/latest.yml') {
    const version = scenario === 'current' ? metadata.version : nextVersion;
    const sha512 =
      scenario === 'invalid' ? Buffer.alloc(64).toString('base64') : hash;
    res.setHeader('Content-Type', 'application/yaml');
    res.end(
      yaml.dump({
        version,
        files: [
          { url: metadata.files[0].url, sha512, size: metadata.files[0].size },
        ],
        path: metadata.files[0].url,
        sha512,
        releaseDate: new Date().toISOString(),
      }),
    );
  } else if (
    new URL(req.url, 'http://localhost').pathname ===
    `/${metadata.files[0].url}`
  ) {
    res.setHeader('Content-Length', metadata.files[0].size);
    createReadStream(installer).pipe(res);
  } else {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const url = `http://127.0.0.1:${server.address().port}`;
const checks = [];
try {
  for (scenario of ['current', 'offline', 'invalid', 'valid']) {
    const profile = await mkdtemp(resolve('test-results/updater-profile-'));
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const application = await electron.launch({
      executablePath: resolve('release/win-unpacked/Discorja.exe'),
      args: [`--user-data-dir=${profile}`],
      env,
      timeout: 30000,
    });
    applications.push(application);
    const page = await application.firstWindow();
    await expect(page.locator('[data-action=create]')).toBeEnabled();
    await application.evaluate(
      ({ app }, { url, profile }) => {
        const updater =
          process.mainModule.require('electron-updater').autoUpdater;
        // Isolate the cache as well as userData. These overrides exist only in
        // this test's main process, never in the distributed application's API.
        Object.defineProperty(updater.app, 'baseCachePath', { value: profile });
        updater.downloadedUpdateHelper = null;
        updater.disableDifferentialDownload = true;
        updater.setFeedURL({ provider: 'generic', url });
        if (!app.isPackaged) throw new Error('Packaged application required');
      },
      { url, profile },
    );
    await page.evaluate(() => window.discorja.checkUpdates());
    if (scenario === 'offline') {
      await expect
        .poll(
          () =>
            page.evaluate(
              async () => (await window.discorja.getUpdateState()).status,
            ),
          { timeout: 30000 },
        )
        .toBe('error');
      await expect(page.locator('[data-action=create]')).toBeEnabled();
      checks.push('Provider connection failure leaves the application usable');
    } else if (scenario === 'current') {
      await expect
        .poll(() =>
          page.evaluate(
            async () => (await window.discorja.getUpdateState()).status,
          ),
        )
        .toBe('current');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      checks.push('Current version produces no popup with real updater');
    } else {
      await expect(
        page.getByRole('heading', { name: 'Atualização disponível' }),
      ).toBeVisible();
      await page.locator('[data-action=download-update]').click();
      const expected = scenario === 'invalid' ? 'error' : 'downloaded';
      await expect
        .poll(
          () =>
            page.evaluate(
              async () => (await window.discorja.getUpdateState()).status,
            ),
          { timeout: 30000 },
        )
        .toBe(expected);
      if (scenario === 'valid')
        await expect(
          page.locator('[data-action=confirm-install-update]'),
        ).toBeVisible();
      else
        await expect(
          page.locator('[data-action=confirm-install-update]'),
        ).toHaveCount(0);
      await page.locator('[data-action=defer-update]').click();
      await expect(page.locator('[data-action=create]')).toBeEnabled();
      checks.push(
        scenario === 'invalid'
          ? 'Incorrect SHA-512 refuses package and app remains usable'
          : 'Actual local installer downloads, validates and awaits explicit restart',
      );
    }
    await application.close();
    console.log(checks.at(-1));
  }
  await writeFile(
    'test-results/updater.json',
    JSON.stringify(
      { checks, fixtureProvider: 'local generic', installedOrPublished: false },
      null,
      2,
    ),
  );
} finally {
  await Promise.allSettled(
    applications.map((application) => application.close()),
  );
  await new Promise((done) => server.close(done));
}
