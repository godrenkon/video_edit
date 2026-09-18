import { describe, expect, it } from 'vitest';
import { normalizeTransition, transitionOpacity } from './transitionEnvelope';

describe('visual transition envelope', () => {
  it('fades a dissolve in and out on clip-local time', () => {
    const clip = {
      duration: 10,
      transitionIn: { kind: 'dissolve' as const, duration: 2 },
      transitionOut: { kind: 'dissolve' as const, duration: 3 },
    };
    expect(transitionOpacity(clip, 0)).toBe(0);
    expect(transitionOpacity(clip, 1)).toBeCloseTo(0.5);
    expect(transitionOpacity(clip, 5)).toBe(1);
    expect(transitionOpacity(clip, 8.5)).toBeCloseTo(0.5);
    expect(transitionOpacity(clip, 10)).toBe(0);
  });

  it('uses the limiting envelope when in/out durations overlap', () => {
    const clip = {
      duration: 2,
      transitionIn: { kind: 'dissolve' as const, duration: 2 },
      transitionOut: { kind: 'dissolve' as const, duration: 2 },
    };
    expect(transitionOpacity(clip, 1)).toBeCloseTo(0.5);
  });

  it('normalizes invalid and overlong transition durations', () => {
    expect(normalizeTransition({ kind: 'dissolve', duration: 99 }, 4)).toEqual({ kind: 'dissolve', duration: 4 });
    expect(normalizeTransition({ kind: 'dissolve', duration: -1 }, 4)).toBeUndefined();
  });
});
