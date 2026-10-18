const splashDuration = 1_900;
const splashFadeDuration = 550;
const startupStartedAt = performance.now();
const startupSighUrl = new URL('./assets/startup-sigh.wav', import.meta.url)
  .href;
let dismissalScheduled = false;
let activeStartupAudio: HTMLAudioElement | null = null;

function reportStartupAudio(
  audioState:
    | 'initializing'
    | 'playing'
    | 'ended'
    | 'failed'
    | 'started'
    | 'unsupported'
    | 'missing-element',
): void {
  void window.discorja
    ?.recordLog({ event: 'renderer.audio-startup', details: { audioState } })
    .catch(() => undefined);
}

function startStartupSigh(): void {
  const eye = document.querySelector<HTMLElement>('.startup-eye-glow-left');
  if (!eye) {
    reportStartupAudio('missing-element');
    return;
  }

  try {
    reportStartupAudio('initializing');
    const audio = document.createElement('audio');
    activeStartupAudio = audio;
    audio.preload = 'auto';
    audio.src = startupSighUrl;
    audio.volume = 0.8;
    let cleanedUp = false;
    const cleanup = () => {
      if (cleanedUp) return;
      cleanedUp = true;
      audio.remove();
      if (activeStartupAudio === audio) activeStartupAudio = null;
    };
    audio.addEventListener('playing', () => reportStartupAudio('playing'), {
      once: true,
    });
    audio.addEventListener(
      'ended',
      () => {
        reportStartupAudio('ended');
        cleanup();
      },
      { once: true },
    );
    audio.addEventListener(
      'error',
      () => {
        reportStartupAudio('failed');
        cleanup();
      },
      { once: true },
    );
    void audio.play().then(
      () => reportStartupAudio('started'),
      () => {
        reportStartupAudio('failed');
        cleanup();
      },
    );
  } catch {
    reportStartupAudio('failed');
    /* Audio is decorative; startup continues if the output device is unavailable. */
  }
}

function startSighWhenVisible(): void {
  const api = window.discorja;
  if (!api) {
    startStartupSigh();
    return;
  }

  let started = false;
  let unsubscribe: () => void = () => undefined;
  const start = (visible: boolean) => {
    if (!visible || started) return;
    started = true;
    unsubscribe();
    startStartupSigh();
  };
  unsubscribe = api.onForeground(start);
  void api
    .getForeground()
    .then(start)
    .catch(() => undefined);
}

startSighWhenVisible();

/** Fade the startup mark after the first interface render has had time to appear. */
export function dismissStartupSplash(): void {
  const splash = document.querySelector<HTMLElement>('#startup-splash');
  if (!splash || dismissalScheduled) return;
  dismissalScheduled = true;

  const remaining = Math.max(
    0,
    splashDuration - (performance.now() - startupStartedAt),
  );
  window.setTimeout(() => {
    document.querySelector('#app')?.removeAttribute('inert');
    splash.classList.add('is-leaving');
    window.setTimeout(() => splash.remove(), splashFadeDuration);
  }, remaining);
}
