const glowX = '--cursor-glow-x';
const glowY = '--cursor-glow-y';
const particleCount = 16;
const repelRadius = 150;
const repelStrength = 22;

function randomBetween(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function createParticleLayer(animate: boolean): HTMLElement {
  const layer = document.createElement('div');
  layer.className = 'ambient-particle-layer';
  layer.setAttribute('aria-hidden', 'true');

  for (let index = 0; index < particleCount; index += 1) {
    const particle = document.createElement('span');
    particle.className = 'ambient-orb';
    particle.style.setProperty('--left', `${randomBetween(2, 98)}%`);
    particle.style.setProperty('--top', `${randomBetween(3, 97)}%`);
    particle.style.setProperty('--size', `${randomBetween(2, 6)}px`);
    particle.style.setProperty('--duration', `${randomBetween(20, 38)}s`);
    particle.style.setProperty('--delay', `${randomBetween(-38, 0)}s`);
    particle.style.setProperty('--drift-x1', `${randomBetween(-95, 95)}px`);
    particle.style.setProperty('--drift-y1', `${randomBetween(-85, 85)}px`);
    particle.style.setProperty('--drift-x2', `${randomBetween(-120, 120)}px`);
    particle.style.setProperty('--drift-y2', `${randomBetween(-110, 110)}px`);
    particle.style.setProperty('--drift-x3', `${randomBetween(-80, 80)}px`);
    particle.style.setProperty('--drift-y3', `${randomBetween(-125, 125)}px`);
    particle.style.opacity = `${randomBetween(0.2, 0.48)}`;
    if (!animate) particle.style.animation = 'none';

    const glow = document.createElement('span');
    glow.className = 'ambient-orb-glow';
    particle.append(glow);
    layer.append(particle);
  }

  document.body.prepend(layer);
  return layer;
}

/** Add a small, independently drifting ambient layer and gently repel it from the pointer. */
export function initializeBackgroundEffect(): void {
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const layer = createParticleLayer(!reducedMotion.matches);
  if (reducedMotion.matches || !finePointer.matches) return;

  let frame = 0;
  let pointerX = window.innerWidth * 0.76;
  let pointerY = window.innerHeight * 0.18;

  const applyPosition = () => {
    frame = 0;
    document.documentElement.style.setProperty(glowX, `${pointerX}px`);
    document.documentElement.style.setProperty(glowY, `${pointerY}px`);

    for (const particle of layer.querySelectorAll<HTMLElement>(
      '.ambient-orb',
    )) {
      const bounds = particle.getBoundingClientRect();
      const deltaX = bounds.left + bounds.width / 2 - pointerX;
      const deltaY = bounds.top + bounds.height / 2 - pointerY;
      const distance = Math.hypot(deltaX, deltaY);
      const influence = Math.max(0, 1 - distance / repelRadius);
      const force = repelStrength * influence * influence;
      const length = distance || 1;
      const glow = particle.querySelector<HTMLElement>('.ambient-orb-glow');
      glow?.style.setProperty('--repel-x', `${(deltaX / length) * force}px`);
      glow?.style.setProperty('--repel-y', `${(deltaY / length) * force}px`);
    }
  };

  const schedulePosition = () => {
    if (!frame) frame = window.requestAnimationFrame(applyPosition);
  };

  window.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      pointerX = event.clientX;
      pointerY = event.clientY;
      schedulePosition();
    },
    { passive: true },
  );

  const resetPosition = () => {
    pointerX = window.innerWidth * 0.76;
    pointerY = window.innerHeight * 0.18;
    schedulePosition();
  };
  window.addEventListener('pointerleave', resetPosition, { passive: true });
  window.addEventListener('blur', resetPosition);
}
