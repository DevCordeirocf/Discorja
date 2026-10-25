import type { GroupRoom, ServerMessage } from '../../../shared/protocol';
import { SignalConnection } from '../../transport/signal';
import { warmUpServer } from '../../transport/server-warmup';

export type LobbyStatus =
  'idle' | 'connecting' | 'waking' | 'online' | 'unsupported' | 'offline';

export interface GroupListing {
  rooms: GroupRoom[];
  online: string[];
}

export interface LobbyConnection {
  connect(options: { protocols: readonly number[] }): Promise<number>;
  send(message: Parameters<SignalConnection['send']>[0]): void;
  disconnect(): void;
}

export interface GroupLobbyOptions {
  getSignalingUrl(): string;
  getName(): string;
  onListing(groupKey: string, listing: GroupListing): void;
  onStatus(status: LobbyStatus): void;
  /** Injected for tests; defaults to the real WebSocket connection. */
  createConnection?(
    url: string,
    onMessage: (message: ServerMessage) => void,
    onClose: () => void,
  ): LobbyConnection;
  warmUp?(url: string, onWaking: () => void): Promise<boolean>;
}

const RETRY_MS = [2_000, 5_000, 10_000, 30_000];

/**
 * One light socket that follows the user's groups while the Groups page is
 * open. It never sends keep-alives, so an idle app lets the free server sleep.
 */
export function createGroupLobby(options: GroupLobbyOptions) {
  const createConnection =
    options.createConnection ??
    ((url, onMessage, onClose) =>
      new SignalConnection(url, onMessage, () => onClose()));
  const warmUp =
    options.warmUp ??
    ((url, onWaking) => warmUpServer(url, { onWaking, deadlineMs: 60_000 }));
  let keys: string[] = [];
  let connection: LobbyConnection | null = null;
  let active = false;
  let generation = 0;
  let attempt = 0;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let status: LobbyStatus = 'idle';

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

  const scheduleRetry = (current: number) => {
    if (!active || current !== generation) return;
    clearTimeout(retryTimer);
    retryTimer = setTimeout(
      () => void open(current),
      RETRY_MS[Math.min(attempt++, RETRY_MS.length - 1)],
    );
  };

  async function open(current: number): Promise<void> {
    if (!active || current !== generation) return;
    connection?.disconnect();
    setStatus('connecting');
    const url = options.getSignalingUrl();
    const next = createConnection(
      url,
      (message) => {
        if (current !== generation || message.type !== 'group-state') return;
        options.onListing(message.groupKey, {
          rooms: message.rooms,
          online: message.online,
        });
      },
      () => {
        if (current !== generation) return;
        connection = null;
        setStatus('offline');
        scheduleRetry(current);
      },
    );
    connection = next;
    try {
      await warmUp(url, () => {
        if (current === generation) setStatus('waking');
      });
      if (current !== generation) return;
      await next.connect({ protocols: [5] });
      if (current !== generation) {
        next.disconnect();
        return;
      }
      attempt = 0;
      setStatus('online');
      for (const groupKey of keys) subscribe(groupKey);
    } catch (error) {
      if (current !== generation) return;
      next.disconnect();
      connection = null;
      if (error instanceof Error && error.message.includes('incompatível')) {
        setStatus('unsupported');
        return;
      }
      setStatus('offline');
      scheduleRetry(current);
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
      if (value) {
        attempt = 0;
        void open(generation);
      } else {
        connection?.disconnect();
        connection = null;
        setStatus('idle');
      }
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
