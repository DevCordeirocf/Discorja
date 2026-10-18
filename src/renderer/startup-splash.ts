const splashDuration = 1_900;
const splashFadeDuration = 550;
const startupStartedAt = performance.now();
let dismissalScheduled = false;

function startStartupSigh(): void {
  if (!('AudioContext' in window)) return;
  const eye = document.querySelector<HTMLElement>('.startup-eye-glow-left');
  if (!eye) return;

  const style = getComputedStyle(eye);
  const durationMs = Number.parseFloat(
    style.getPropertyValue('--startup-eye-glow-duration'),
  );
  const delayMs = Number.parseFloat(
    style.getPropertyValue('--startup-eye-glow-delay'),
  );
  const peakPercent = Number.parseFloat(
    style.getPropertyValue('--startup-eye-glow-peak'),
  );
  if (![durationMs, delayMs, peakPercent].every(Number.isFinite)) return;

  try {
    const context = new AudioContext();
    void context
      .resume()
      .then(() => {
        const duration = durationMs / 1000;
        const peakAt = duration * (peakPercent / 100);
        const sampleCount = Math.ceil(context.sampleRate * duration);
        const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
        const samples = buffer.getChannelData(0);

        const glidePhase = (time: number, from: number, to: number) => {
          if (time <= peakAt)
            return from * time + ((to - from) * time * time) / (2 * peakAt);
          return ((from + to) * peakAt) / 2 + to * (time - peakAt);
        };

        for (let index = 0; index < sampleCount; index++) {
          const time = index / context.sampleRate;
          const rise = Math.min(1, time / peakAt);
          const attack = rise * rise * (3 - 2 * rise);
          const release = Math.min(
            1,
            Math.max(0, (time - peakAt) / (duration - peakAt)),
          );
          const decay = Math.cos((release * Math.PI) / 2) ** 1.2;
          const envelope = attack * decay;
          const bass = Math.sin(2 * Math.PI * glidePhase(time, 64, 48));
          const tensionA = Math.sin(2 * Math.PI * glidePhase(time, 103, 96));
          const tensionB = Math.sin(2 * Math.PI * glidePhase(time, 108, 101));
          const undertone = Math.sin(2 * Math.PI * 131 * time);
          samples[index] =
            (bass * 0.42 +
              tensionA * 0.16 +
              tensionB * 0.13 +
              undertone * 0.08) *
            envelope;
        }

        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer;
        // Keep the opening soft, while leaving enough headroom to hear it on
        // ordinary laptop speakers at a typical system volume.
        gain.gain.value = 0.12;
        source.connect(gain);
        gain.connect(context.destination);
        const elapsedMs = performance.now() - startupStartedAt;
        const soundOffset = Math.max(0, elapsedMs - delayMs) / 1000;
        if (soundOffset >= duration) {
          void context.close();
          return;
        }
        const startAt =
          context.currentTime + Math.max(0, delayMs - elapsedMs) / 1000;
        source.onended = () => void context.close();
        source.start(startAt, soundOffset);
      })
      .catch(() => void context.close());
  } catch {
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
