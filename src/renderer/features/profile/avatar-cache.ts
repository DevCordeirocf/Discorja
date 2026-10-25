const MAX_ENTRIES = 24;
const MAX_IN_FLIGHT = 2;
const REQUEST_TIMEOUT_MS = 5_000;
const MAX_ATTEMPTS = 3;

interface Entry {
  url: string;
  blob: Blob;
  animated: boolean;
  poster?: string;
  posterPending?: boolean;
}

interface Pending {
  peerId: string;
  attempts: number;
  retryAt: number;
  inFlight: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

export interface AvatarCacheOptions {
  /** Sends get-avatar; the answer arrives through receive(). */
  request(peerId: string, avatarId: string): void;
  /** Called when an image becomes available, to re-render. */
  onChange(): void;
  reducedMotion(): boolean;
  /** SHA-256 hex of the data URL, as computed by the server. */
  digest?(text: string): Promise<string>;
  /** Builds a still JPEG from an animated image for reduced motion. */
  makePoster?(blob: Blob): Promise<Blob | null>;
  now?(): number;
}

async function sha256Hex(text: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function firstFrame(blob: Blob): Promise<Blob | null> {
  const bitmap = await createImageBitmap(blob);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0);
    return await new Promise((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', 0.86),
    );
  } finally {
    bitmap.close();
  }
}

function toBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(',');
  const type = dataUrl.slice(5, dataUrl.indexOf(';'));
  const binary = atob(dataUrl.slice(comma + 1));
  return new Blob([Uint8Array.from(binary, (char) => char.charCodeAt(0))], {
    type,
  });
}

/**
 * Protocol 5 room snapshots carry only an avatar hash. This cache fetches each
 * image once, checks it against that hash and serves it as a blob: URL so the
 * markup stays small on every render.
 */
export function createAvatarCache(options: AvatarCacheOptions) {
  const now = options.now ?? Date.now;
  const digest = options.digest ?? sha256Hex;
  const makePoster = options.makePoster ?? firstFrame;
  const entries = new Map<string, Entry>();
  const pending = new Map<string, Pending>();
  let generation = 0;

  const inFlight = () =>
    [...pending.values()].filter((item) => item.inFlight).length;

  const pump = () => {
    for (const [avatarId, item] of pending) {
      if (inFlight() >= MAX_IN_FLIGHT) return;
      if (item.inFlight || item.retryAt > now()) continue;
      if (item.attempts >= MAX_ATTEMPTS) continue;
      item.inFlight = true;
      item.attempts++;
      options.request(item.peerId, avatarId);
      item.timer = setTimeout(() => {
        item.inFlight = false;
        item.retryAt = now() + 5_000 * 2 ** (item.attempts - 1);
        pump();
      }, REQUEST_TIMEOUT_MS);
    }
  };

  const ensurePoster = (entry: Entry) => {
    if (entry.poster || entry.posterPending) return;
    entry.posterPending = true;
    const current = generation;
    void makePoster(entry.blob)
      .catch(() => null)
      .then((still) => {
        if (current !== generation || !still) return;
        entry.poster = URL.createObjectURL(still);
        options.onChange();
      });
  };

  const remember = (avatarId: string, entry: Entry) => {
    entries.delete(avatarId);
    entries.set(avatarId, entry);
    while (entries.size > MAX_ENTRIES) {
      const [oldestId, oldest] = entries.entries().next().value!;
      entries.delete(oldestId);
      URL.revokeObjectURL(oldest.url);
      if (oldest.poster) URL.revokeObjectURL(oldest.poster);
    }
  };

  return {
    urlFor(peerId: string, avatarId: string): string | undefined {
      const entry = entries.get(avatarId);
      if (entry) {
        if (entry.animated && options.reducedMotion()) {
          ensurePoster(entry);
          return entry.poster;
        }
        return entry.url;
      }
      if (!pending.has(avatarId)) {
        pending.set(avatarId, {
          peerId,
          attempts: 0,
          retryAt: 0,
          inFlight: false,
        });
        queueMicrotask(pump);
      }
      return undefined;
    },

    async receive(message: {
      peerId: string;
      avatarId: string;
      avatar: string;
    }): Promise<void> {
      const item = pending.get(message.avatarId);
      if (!item || entries.has(message.avatarId)) return;
      const current = generation;
      const hash = (await digest(message.avatar)).slice(0, 16);
      if (current !== generation || hash !== message.avatarId) return;
      clearTimeout(item.timer);
      pending.delete(message.avatarId);
      const blob = toBlob(message.avatar);
      const animated = blob.type === 'image/gif' || blob.type === 'image/webp';
      remember(message.avatarId, {
        url: URL.createObjectURL(blob),
        blob,
        animated,
      });
      options.onChange();
      pump();
    },

    /** Forgets everything when the room ends. */
    clear(): void {
      generation++;
      for (const item of pending.values()) clearTimeout(item.timer);
      pending.clear();
      for (const entry of entries.values()) {
        URL.revokeObjectURL(entry.url);
        if (entry.poster) URL.revokeObjectURL(entry.poster);
      }
      entries.clear();
    },
  };
}

export type AvatarCache = ReturnType<typeof createAvatarCache>;
