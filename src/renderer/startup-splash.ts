const splashDuration = 1_900;
const splashFadeDuration = 550;
const startupStartedAt = performance.now();
let dismissalScheduled = false;

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
