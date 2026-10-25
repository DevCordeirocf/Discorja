import { expect } from '@playwright/test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';

// Shared steps for the Electron smoke tests: since 0.10.0 every room lives
// inside a group, so tests create or join a group before using its rooms.
// Invites, codes and resume tokens stay in memory and are never printed.

const createForm = '[data-group-form=create]';
const joinForm = '[data-group-form=join]';

/** Waits until the window can be used: the welcome forms or a group page. */
export async function appReady(page) {
  await expect(
    page
      .locator(
        `${createForm} button[type=submit], [data-action=copy-group-invite]`,
      )
      .first(),
  ).toBeEnabled({ timeout: 30000 });
  await expect(page.locator('#startup-splash')).toHaveCount(0, {
    timeout: 15000,
  });
}

/** The room controls; present while this app is in a room, on any page. */
export function roomControls(page) {
  return page.locator('#room-view [data-action=leave]');
}

/** Name of the room this app is in. */
export function currentRoom(page) {
  return page.locator('#room-view .multi-room-header h1');
}

async function fillName(page, name) {
  const field = page.locator('#display-name');
  if (name && (await field.count())) await field.fill(name);
}

/** Waits for the selected group's page with the lobby online. */
export async function groupOnline(page) {
  await expect(page.locator('[data-action=create-group-room]')).toBeEnabled({
    timeout: 30000,
  });
}

/** Creates a group from the welcome screen, also entering the display name. */
export async function createGroup(page, { name, group }) {
  await fillName(page, name);
  await page.locator(`${createForm} [data-group-field=name]`).fill(group);
  await page.locator(`${createForm} button[type=submit]`).click();
  await groupOnline(page);
}

/** Joins a group from the welcome screen with an invite. */
export async function joinGroup(page, { name, invite }) {
  await fillName(page, name);
  await page.locator(`${joinForm} [data-group-field=invite]`).fill(invite);
  await page.locator(`${joinForm} button[type=submit]`).click();
  await groupOnline(page);
}

/**
 * Copies the selected group's invite through the app (IPC group:copy-invite)
 * and reads it from the Electron clipboard. The previous clipboard text is
 * restored afterwards.
 */
export async function copyInvite(application, page) {
  const previous = await application.evaluate(({ clipboard }) =>
    clipboard.readText(),
  );
  try {
    await application.evaluate(({ clipboard }) => clipboard.writeText(''));
    await showGroup(page);
    await page.locator('[data-action=copy-group-invite]').click();
    await expect(page.locator('.notice')).toContainText('Convite copiado');
    const invite = await application.evaluate(({ clipboard }) =>
      clipboard.readText(),
    );
    assert.match(invite, /^DJG1/, 'The copied text must be a group invite');
    return invite;
  } finally {
    await application.evaluate(
      ({ clipboard }, text) => clipboard.writeText(text),
      previous,
    );
  }
}

/** Opens the selected group's page (Início) from any page. */
export async function showGroup(page) {
  const create = page.locator('[data-action=create-group-room]');
  if (await create.isVisible()) return;
  await page.locator('.rail [data-action=select-group]').first().click();
  await expect(create).toBeVisible();
}

/** Returns from Início or Configurações to the room in use. */
export async function backToRoom(page) {
  await page.locator('.rail [data-action=room]').click();
  await expect(roomControls(page)).toBeVisible();
}

/** Starts a room in the selected group and waits to be inside it. */
export async function createRoom(page) {
  await showGroup(page);
  await groupOnline(page);
  await page.locator('[data-action=create-group-room]').click();
  await expect(roomControls(page)).toBeVisible({ timeout: 15000 });
}

/** The join button of a listed room, by its name ("Sala de …"). */
export function roomCard(page, roomName) {
  return page
    .locator('.room-card')
    .filter({ has: page.getByRole('heading', { name: roomName, exact: true }) })
    .locator('[data-action=join-group-room]');
}

/** Clicks a listed room; when already in a room this asks to switch. */
export async function requestRoom(page, roomName) {
  await showGroup(page);
  const button = roomCard(page, roomName);
  await expect(button).toBeEnabled({ timeout: 15000 });
  await button.click();
}

/** Enters a room listed in the selected group. */
export async function joinRoom(page, roomName) {
  await requestRoom(page, roomName);
  await expect(currentRoom(page)).toHaveText(roomName, { timeout: 15000 });
  await expect(roomControls(page)).toBeVisible();
}

/**
 * Selects the first live screen unless one is already selected. Publication
 * cards toggle, and their aria-pressed state does not reflect the selection
 * yet, so the stage's empty state decides whether a click is needed.
 */
export async function ensureWatching(page) {
  const idle = page
    .locator('#room-view')
    .getByRole('heading', { name: 'Nenhuma transmissão selecionada' });
  if (!(await idle.count())) return;
  const watch = page.locator('[data-action=watch-screen]:not([disabled])');
  await expect(watch.first()).toBeVisible({ timeout: 15000 });
  await watch.first().click();
  await expect(idle).toHaveCount(0);
}

/** Opens Configurações through the profile menu. */
export async function openSettings(page) {
  const toggle = page.locator('[data-action=toggle-profile-menu]');
  if ((await toggle.getAttribute('aria-expanded')) !== 'true')
    await toggle.click();
  await page.locator('.profile-menu [data-action=settings]').click();
  await expect(page.locator('[data-action=close-settings]')).toBeVisible();
}

/**
 * Follows the room sockets on the test server. Group lobbies use their own
 * sockets, so tests pick a participant's room socket by display name instead
 * of by connection order. Only message types, names, codes and resume tokens
 * are read, and only kept in memory.
 */
export function trackRoomSockets(wss) {
  // The server answers inside its own message listener, which runs before
  // this one, so replies are keyed by socket and names are resolved later.
  const names = new Map();
  const codes = new Map();
  const tokens = new Map();
  wss.on('connection', (socket) => {
    const send = socket.send.bind(socket);
    socket.send = (data, ...rest) => {
      const message = parse(data);
      if (
        ['room-state', 'room-created', 'room-joined', 'room-resumed'].includes(
          message?.type,
        )
      ) {
        if (typeof message.code === 'string') codes.set(socket, message.code);
        if (typeof message.resumeToken === 'string')
          tokens.set(message.resumeToken, socket);
      }
      return send(data, ...rest);
    };
    socket.on('message', (data) => {
      const message = parse(data);
      if (message?.type === 'create-room' || message?.type === 'join-room')
        names.set(socket, message.name);
      else if (message?.type === 'resume-room') {
        const previous = tokens.get(message.token);
        if (names.has(previous)) names.set(socket, names.get(previous));
      }
    });
  });
  const socketsOf = (name) =>
    [...names].filter(([, owner]) => owner === name).map(([socket]) => socket);
  return {
    /** Code of the last room this participant entered. */
    code(name) {
      const socket = socketsOf(name).findLast((entry) => codes.has(entry));
      assert.ok(socket, `No room recorded for ${name}`);
      return codes.get(socket);
    },
    /** Drops this participant's room connection without a close frame. */
    terminate(name) {
      const socket = socketsOf(name).find(
        (entry) => entry.readyState === WebSocket.OPEN,
      );
      assert.ok(socket, `No open room socket for ${name}`);
      socket.terminate();
    },
  };
}

function parse(data) {
  try {
    return JSON.parse(String(data));
  } catch {
    return undefined;
  }
}

/**
 * Asks the server directly, as an older client entering by code would, to join
 * this room, and resolves with the server's error code.
 */
export function joinByCodeError(url, code) {
  return new Promise((done, reject) => {
    // Same Origin as the desktop app, like scripts/check-server.mjs.
    const socket = new WebSocket(url, { origin: 'app://discorja' });
    const timer = setTimeout(() => {
      socket.terminate();
      reject(new Error('Timeout: join-room answer'));
    }, 10000);
    const finish = (value) => {
      clearTimeout(timer);
      socket.close();
      done(value);
    };
    socket.on('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    socket.on('open', () =>
      socket.send(JSON.stringify({ type: 'hello', protocol: 5 })),
    );
    socket.on('message', (data) => {
      const message = parse(data);
      if (message?.type === 'hello')
        socket.send(
          JSON.stringify({ type: 'join-room', code, name: 'Verificação' }),
        );
      else if (message?.type === 'error') finish(message.code);
      else if (message?.type === 'room-state') finish('joined');
    });
  });
}
