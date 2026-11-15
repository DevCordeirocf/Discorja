/**
 * Decorative effects (drifting orbs, cursor glow, backdrop blur, looping
 * pulses) are paused while the host shares or the window is in the
 * background. Sharing disables background throttling, so without this the
 * renderer would keep compositing them at display rate next to a game.
 */
export function ambientEffectsAllowed(state: {
  sharing: boolean;
  foreground: boolean;
}): boolean {
  return !state.sharing && state.foreground;
}

export function syncAmbientEffects(
  element: HTMLElement,
  allowed: boolean,
): void {
  if (allowed) delete element.dataset.effects;
  else if (element.dataset.effects !== 'reduced')
    element.dataset.effects = 'reduced';
}

export function ambientEffectsReduced(element: HTMLElement): boolean {
  return element.dataset.effects === 'reduced';
}
