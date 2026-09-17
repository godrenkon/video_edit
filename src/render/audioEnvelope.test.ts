import { describe, expect, it } from 'vitest';
import { clipFadeGain } from './audioEnvelope';

describe('clip audio fade envelope', () => {
  it('keeps full gain when fades are disabled', () => {
    expect(clipFadeGain({ duration: 10 }, 0)).toBe(1);
    expect(clipFadeGain({ duration: 10 }, 5)).toBe(1);
    expect(clipFadeGain({ duration: 10 }, 10)).toBe(1);
  });

  it('applies linear fade in and fade out', () => {
    const envelope = { duration: 10, fadeIn: 2, fadeOut: 4 };
    expect(clipFadeGain(envelope, 0)).toBe(0);
    expect(clipFadeGain(envelope, 1)).toBeCloseTo(0.5, 8);
    expect(clipFadeGain(envelope, 2)).toBe(1);
    expect(clipFadeGain(envelope, 8)).toBeCloseTo(0.5, 8);
    expect(clipFadeGain(envelope, 10)).toBe(0);
  });

  it('combines overlapping fades safely on short clips', () => {
    const envelope = { duration: 2, fadeIn: 2, fadeOut: 2 };
    expect(clipFadeGain(envelope, 1)).toBeCloseTo(0.25, 8);
    expect(clipFadeGain(envelope, -1)).toBe(0);
    expect(clipFadeGain(envelope, 3)).toBe(0);
  });

  it('clamps oversized and invalid fade values', () => {
    expect(clipFadeGain({ duration: 1, fadeIn: 10, fadeOut: -5 }, 0.5)).toBeCloseTo(0.5, 8);
    expect(clipFadeGain({ duration: 0, fadeIn: 1, fadeOut: 1 }, 0)).toBe(0);
  });
});
