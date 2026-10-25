import { describe, expect, it } from 'vitest';
import {
  GIF_BUDGETS,
  planFrames,
} from '../src/renderer/features/profile/animated-avatar';

describe('planejamento de GIFs de perfil', () => {
  it('mantém só os primeiros seis segundos', () => {
    const plan = planFrames(Array(200).fill(100), 1000);
    expect(plan).toHaveLength(60);
    expect(plan.reduce((sum, step) => sum + step.delay, 0)).toBe(6000);
  });

  it('amostra quadros de forma uniforme sem mudar a duração', () => {
    const plan = planFrames(Array(48).fill(100), 12);
    expect(plan).toHaveLength(12);
    expect(plan.every((step) => step.delay === 400)).toBe(true);
  });

  it('usa duração mínima para quadros sem tempo', () => {
    expect(planFrames([0, 0], 10)[0].delay).toBe(100);
  });

  it('reduz o orçamento a cada tentativa', () => {
    for (let index = 1; index < GIF_BUDGETS.length; index++)
      expect(GIF_BUDGETS[index].size * GIF_BUDGETS[index].frames).toBeLessThan(
        GIF_BUDGETS[index - 1].size * GIF_BUDGETS[index - 1].frames,
      );
  });
});
