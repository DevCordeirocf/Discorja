import {
  LOBBY_PROTOCOL_VERSION,
  LOBBY_PROTOCOLS,
  type GroupRoom,
  type ServerMessage,
} from '../../../shared/protocol';
import { profileAvatar } from '../../../shared/validation';
import { SignalConnection } from '../../transport/signal';

export type LobbyStatus =
  'idle' | 'connecting' | 'waking' | 'online' | 'unsupported' | 'offline';

export interface GroupListing {
  rooms: GroupRoom[];
  online: string[];
  /** avatarId for each name in `online`, '' without photo or on older servers. */
  avatars: string[];
}

export interface GroupAvatar {
  groupKey: string;
  avatarId: string;
  avatar: string;
}

export interface LobbyConnection {
  connect(options: {
    protocols: readonly number[];
    timeoutMs?: number;
  }): Promise<number>;
  send(message: Parameters<SignalConnection['send']>[0]): void;
  disconnect(): void;
}

export interface GroupLobbyOptions {
  getSignalingUrl(): string;
  getName(): string;
  /** The saved profile photo, shown to the group in "Online agora". */
  getPhoto?(): string;
  onListing(groupKey: string, listing: GroupListing): void;
  onAvatar?(avatar: GroupAvatar): void;
  onStatus(status: LobbyStatus): void;
  /** Injected for tests; defaults to the real WebSocket connection. */
  createConnection?(
    url: string,
    onMessage: (message: ServerMessage) => void,
    onClose: () => void,
  ): LobbyConnection;
}

/** After a connection that worked, retries back off to spare the server. */
const RETRY_MS = [2_000, 5_000, 10_000, 30_000];
/** Says "Acordando o servidor…" when the first answer takes this long. */
const WAKING_AFTER_MS = 1_500;
/**
 * A sleeping free-tier server wakes on the WebSocket itself and holds it
 * until ready, so the first attempt waits longer than a normal one.
 */
const WAKE_CONNECT_TIMEOUT_MS = 20_000;
/** While waking, a failed attempt is retried quickly for this long. */
const WAKE_WINDOW_MS = 90_000;
// Every two seconds stays well under the server's 60 connections per minute.
const WAKE_RETRY_MS = 2_000;

/**
 * One light socket that follows the user's groups while the Groups page is
 * open. It never sends keep-alives, so an idle app lets the free server sleep.
 */
export function createGroupLobby(options: GroupLobbyOptions) {
  const createConnection =
    options.createConnection ??
    ((url, onMessage, onClose) =>
      new SignalConnection(url, onMessage, () => onClose()));
  let keys: string[] = [];
  let connection: LobbyConnection | null = null;
  let active = false;
  let generation = 0;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let wakingTimer: ReturnType<typeof setTimeout> | undefined;
  let status: LobbyStatus = 'idle';
  // Negotiated protocol of the open connection; 6 carries photos.
  let protocol = 0;
  // Set when the page opens; cleared once the server answers.
  let wakeStartedAt: number | null = null;
  const waking = () =>
    wakeStartedAt !== null && Date.now() - wakeStartedAt < WAKE_WINDOW_MS;

  const setStatus = (next: LobbyStatus) => {
    if (status === next) return;
    status = next;
    options.onStatus(next);
  };

  const subscribe = (groupKey: string) =>
    connection?.send({
      type: 'subscribe-group',
      groupKey,
      name: options.getName().trim() || 'Alguém',
    });

  const photos = () =>
    status === 'online' && protocol >= LOBBY_PROTOCOL_VERSION;

  /** Sends the photo before subscribing so the first listing already has it. */
  const sendProfile = (clear: boolean) => {
    const photo = options.getPhoto?.() ?? '';
    const avatar = profileAvatar(photo) ? photo : '';
    if (avatar || clear)
      connection?.send({ type: 'set-group-profile', avatar });
  };

  const scheduleRetry = (current: number) => {
    if (!active || current !== generation) return;
    clearTimeout(retryTimer);
    const delay = waking()
      ? WAKE_RETRY_MS
      : RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)];
    retryTimer = setTimeout(() => void open(current), delay);
  };

  const fail = (current: number) => {
    clearTimeout(wakingTimer);
    setStatus(waking() ? 'waking' : 'offline');
    scheduleRetry(current);
  };

  async function open(current: number): Promise<void> {
    if (!active || current !== generation) return;
    connection?.disconnect();
    if (status !== 'waking') setStatus('connecting');
    clearTimeout(wakingTimer);
    if (waking())
      wakingTimer = setTimeout(() => {
        if (current === generation && status === 'connecting')
          setStatus('waking');
      }, WAKING_AFTER_MS);
    const next = createConnection(
      options.getSignalingUrl(),
      (message) => {
        if (current !== generation) return;
        if (message.type === 'group-avatar') options.onAvatar?.(message);
        if (message.type !== 'group-state') return;
        options.onListing(message.groupKey, {
          rooms: message.rooms,
          online: message.online,
          avatars: message.avatars ?? message.online.map((): string => ''),
        });
      },
      () => {
        if (current !== generation) return;
        connection = null;
        // An idle free server falls asleep and drops the socket; wake it again.
        if (status === 'online') {
          attempt = 0;
          wakeStartedAt = Date.now();
        }
        fail(current);
      },
    );
    connection = next;
    try {
      const negotiated = await next.connect({
        protocols: LOBBY_PROTOCOLS,
        ...(waking() ? { timeoutMs: WAKE_CONNECT_TIMEOUT_MS } : {}),
      });
      if (current !== generation) {
        next.disconnect();
        return;
      }
      clearTimeout(wakingTimer);
      attempt = 0;
      wakeStartedAt = null;
      protocol = negotiated;
      setStatus('online');
      if (photos()) sendProfile(false);
      for (const groupKey of keys) subscribe(groupKey);
    } catch (error) {
      if (current !== generation) return;
      next.disconnect();
      connection = null;
      if (error instanceof Error && error.message.includes('incompatível')) {
        clearTimeout(wakingTimer);
        setStatus('unsupported');
        return;
      }
      fail(current);
    }
  }

  return {
    get status() {
      return status;
    },
    /** Opens or closes the lobby; safe to call on every render. */
    setActive(value: boolean): void {
      if (value === active) return;
      active = value;
      generation++;
      clearTimeout(retryTimer);
      clearTimeout(wakingTimer);
      if (value) {
        attempt = 0;
        wakeStartedAt = Date.now();
        void open(generation);
      } else {
        wakeStartedAt = null;
        connection?.disconnect();
        connection = null;
        setStatus('idle');
      }
    },
    /** Asks the server for a photo listed in this group's "Online agora". */
    requestAvatar(groupKey: string, avatarId: string): void {
      if (photos() && keys.includes(groupKey))
        connection?.send({ type: 'get-group-avatar', groupKey, avatarId });
    },
    /** Shares a saved name or photo change with the followed groups. */
    refreshProfile(): void {
      if (status !== 'online') return;
      if (photos()) sendProfile(true);
      for (const groupKey of keys) subscribe(groupKey);
    },
    /** Follows exactly these group keys. */
    setKeys(next: string[]): void {
      const added = next.filter((key) => !keys.includes(key));
      const removed = keys.filter((key) => !next.includes(key));
      keys = [...next];
      if (status !== 'online') return;
      for (const groupKey of removed)
        connection?.send({ type: 'unsubscribe-group', groupKey });
      for (const groupKey of added) subscribe(groupKey);
    },
  };
}
