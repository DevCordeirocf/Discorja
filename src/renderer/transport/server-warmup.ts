/** HTTP health endpoint that belongs to a signaling WebSocket URL. */
export function healthUrl(signalingUrl: string): URL {
  const url = new URL(signalingUrl);
  url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
  url.pathname = '/health';
  url.search = '';
  url.hash = '';
  return url;
}

export interface WarmUpOptions {
  /** Total time to wait for a sleeping free-tier instance. */
  deadlineMs?: number;
  /** Called once when the server is clearly not answering right away. */
  onWaking?: () => void;
  isCancelled?: () => boolean;
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const ATTEMPT_TIMEOUT_MS = 8_000;
const WAKING_AFTER_MS = 1_500;
const BACKOFF_MS = [1_000, 2_000, 4_000, 5_000];

/**
 * Wakes a suspended server (Render free tier) before opening the WebSocket.
 * Any HTTP answer counts: an opaque no-cors response still proves the
 * instance is running. Returns false when the deadline passes.
 */
export async function warmUpServer(
  signalingUrl: string,
  options: WarmUpOptions = {},
): Promise<boolean> {
  const request = options.fetch ?? fetch;
  const now = options.now ?? Date.now;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + (options.deadlineMs ?? 60_000);
  const url = healthUrl(signalingUrl);
  let waking = false;
  const wakingTimer = setTimeout(() => {
    waking = true;
    options.onWaking?.();
  }, WAKING_AFTER_MS);
  try {
    for (let attempt = 0; ; attempt++) {
      if (options.isCancelled?.()) return false;
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        Math.max(1, Math.min(ATTEMPT_TIMEOUT_MS, deadline - now())),
      );
      try {
        await request(url, {
          method: 'GET',
          mode: 'no-cors',
          cache: 'no-store',
          credentials: 'omit',
          signal: controller.signal,
        });
        return true;
      } catch {
        // Not reachable yet; a waking instance often drops the first requests.
      } finally {
        clearTimeout(timeout);
      }
      const wait = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      if (now() + wait >= deadline) return false;
      if (!waking) {
        waking = true;
        clearTimeout(wakingTimer);
        options.onWaking?.();
      }
      await sleep(wait);
    }
  } finally {
    clearTimeout(wakingTimer);
  }
}
