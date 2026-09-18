import { describe, expect, it } from 'vitest';
import { applyTrackGainPan, dbToLinear, linearToDb, normalizeTrackGain, normalizeTrackPan } from './trackMix';

describe('track mix helpers', () => {
  it('normalizes missing and invalid gain/pan safely', () => {
    expect(normalizeTrackGain(undefined)).toBe(1);
    expect(normalizeTrackGain(99)).toBe(4);
    expect(normalizeTrackPan(undefined)).toBe(0);
    expect(normalizeTrackPan(-9)).toBe(-1);
  });

  it('converts gain between dB and linear values', () => {
    expect(dbToLinear(0)).toBeCloseTo(1, 8);
    expect(dbToLinear(-6)).toBeCloseTo(10 ** (-6 / 20), 8);
    expect(linearToDb(1)).toBeCloseTo(0, 8);
    expect(linearToDb(0)).toBe(-60);
  });

  it('applies a centered gain without changing stereo balance', () => {
    const [left, right] = applyTrackGainPan(0.5, 0.25, 2, 0);
    expect(left).toBeCloseTo(1, 8);
    expect(right).toBeCloseTo(0.5, 8);
  });

  it('uses equal-power pan endpoints', () => {
    const [leftHard, rightHard] = applyTrackGainPan(1, 1, 1, -1);
    expect(leftHard).toBeCloseTo(Math.SQRT2, 8);
    expect(rightHard).toBeCloseTo(0, 8);

    const [leftRight, rightRight] = applyTrackGainPan(1, 1, 1, 1);
    expect(leftRight).toBeCloseTo(0, 8);
    expect(rightRight).toBeCloseTo(Math.SQRT2, 8);
  });
});
