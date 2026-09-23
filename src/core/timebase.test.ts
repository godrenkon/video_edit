import { describe, expect, it } from 'vitest';
import {
  canonicalProjectFrameRate,
  frameDuration,
  frameRateDisplayLabel,
  frameIndexAt,
  frameSyncTolerance,
  frameTime,
  isSameFrame,
  normalizedFrameRate,
  quantizeFrameTime,
} from './timebase';

describe('sequence timebase', () => {
  it('preserves professional fractional frame rates instead of rounding them', () => {
    expect(normalizedFrameRate(23.976)).toBe(23.976);
    expect(normalizedFrameRate(29.97)).toBe(29.97);
    expect(normalizedFrameRate(59.94)).toBe(59.94);
    expect(frameDuration(29.97)).toBeCloseTo(1 / 29.97, 12);
  });

  it('canonicalizes common decimal NTSC labels to exact rational sequence rates', () => {
    expect(canonicalProjectFrameRate(23.976)).toBe(24000 / 1001);
    expect(canonicalProjectFrameRate(29.97)).toBe(30000 / 1001);
    expect(canonicalProjectFrameRate(59.94)).toBe(60000 / 1001);
    expect(canonicalProjectFrameRate(24)).toBe(24);
    expect(frameRateDisplayLabel(30000 / 1001)).toBe('29.97');
  });

  it('round-trips frame indexes at fractional rates', () => {
    const rate = 30000 / 1001;
    for (const frame of [0, 1, 29, 30, 1798, 107892]) {
      expect(frameIndexAt(frameTime(frame, rate), rate)).toBe(frame);
    }
  });

  it('supports directional quantization without floating-point boundary drift', () => {
    const rate = 30000 / 1001;
    const boundary = 100 / rate;
    expect(frameIndexAt(boundary + 1e-12, rate, 'floor')).toBe(100);
    expect(frameIndexAt(boundary - 1e-12, rate, 'ceil')).toBe(100);
    expect(quantizeFrameTime(boundary, rate)).toBeCloseTo(boundary, 12);
  });

  it('compares positions by sequence frame and derives sync tolerance from the same rate', () => {
    expect(isSameFrame(1, 1.01, 30)).toBe(true);
    expect(isSameFrame(1, 1.03, 30)).toBe(false);
    expect(frameSyncTolerance(24)).toBeCloseTo(0.0625, 10);
    expect(frameSyncTolerance(59.94)).toBeCloseTo(1.5 / 59.94, 10);
    expect(frameSyncTolerance(120)).toBe(0.025);
  });
});
