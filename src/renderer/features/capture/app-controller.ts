import type {
  CaptureControllerEffects,
  CaptureControllerState,
} from './renderer-controller';
import { createCaptureController } from './renderer-controller';

type CaptureStateSetters = {
  [Key in keyof CaptureControllerState]?: (
    value: CaptureControllerState[Key],
  ) => void;
};

export function createAppCaptureController(deps: {
  getState(): CaptureControllerState;
  setters: CaptureStateSetters;
  effects: CaptureControllerEffects;
}) {
  const liveState = new Proxy({} as CaptureControllerState, {
    get: (_target, property: string | symbol) =>
      deps.getState()[property as keyof CaptureControllerState],
    set: (_target, property: string | symbol, value: unknown) => {
      const setter = deps.setters[property as keyof CaptureControllerState];
      if (setter) setter(value as never);
      return true;
    },
  });

  return createCaptureController(liveState, deps.effects);
}
