import { describe, expect, it } from 'vitest';
import { normalizeTransition, transitionMotionOffset, transitionOpacity } from './transitionEnvelope';

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

  it('keeps slide transitions fully opaque', () => {
    const clip = {
      duration: 4,
      transitionIn: { kind: 'slide-left' as const, duration: 1 },
      transitionOut: { kind: 'slide-right' as const, duration: 1 },
    };
    expect(transitionOpacity(clip, 0)).toBe(1);
    expect(transitionOpacity(clip, 3.5)).toBe(1);
  });

  it('moves slide-left from one frame width right into position then exits left', () => {
    const clip = {
      duration: 6,
      transitionIn: { kind: 'slide-left' as const, duration: 2 },
      transitionOut: { kind: 'slide-left' as const, duration: 2 },
    };
    expect(transitionMotionOffset(clip, 0, 1920, 1080)).toEqual({ x: 1920, y: 0 });
    expect(transitionMotionOffset(clip, 1, 1920, 1080)).toEqual({ x: 960, y: 0 });
    expect(transitionMotionOffset(clip, 3, 1920, 1080)).toEqual({ x: 0, y: 0 });
    expect(transitionMotionOffset(clip, 5, 1920, 1080)).toEqual({ x: -960, y: 0 });
    expect(transitionMotionOffset(clip, 6, 1920, 1080)).toEqual({ x: -1920, y: 0 });
  });

  it('supports vertical slide directions deterministically', () => {
    const up = { duration: 4, transitionIn: { kind: 'slide-up' as const, duration: 2 } };
    const down = { duration: 4, transitionIn: { kind: 'slide-down' as const, duration: 2 } };
    expect(transitionMotionOffset(up, 0, 1920, 1080)).toEqual({ x: 0, y: 1080 });
    expect(transitionMotionOffset(down, 0, 1920, 1080)).toEqual({ x: 0, y: -1080 });
  });

  it('normalizes supported transition kinds and rejects invalid durations', () => {
    expect(normalizeTransition({ kind: 'dissolve', duration: 99 }, 4)).toEqual({ kind: 'dissolve', duration: 4 });
    expect(normalizeTransition({ kind: 'slide-right', duration: 1.5 }, 4)).toEqual({ kind: 'slide-right', duration: 1.5 });
    expect(normalizeTransition({ kind: 'slide-up', duration: -1 }, 4)).toBeUndefined();
  });
});
