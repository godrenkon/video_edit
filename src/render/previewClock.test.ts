import { describe, expect, it } from 'vitest';
import { previewFrameTime, previewSyncTolerance, quantizePreviewTime } from './previewClock';

describe('preview clock', () => {
  it('quantizes arbitrary playhead positions to project frames', () => {
    expect(quantizePreviewTime(1.02, 30)).toBeCloseTo(31 / 30, 10);
    expect(quantizePreviewTime(-5, 30)).toBe(0);
  });

  it('derives time from origin plus elapsed time without accumulating deltas', () => {
    expect(previewFrameTime(10, 0.999, 30, 60)).toBeCloseTo(10.9666666667, 8);
    expect(previewFrameTime(10, 1.001, 30, 60)).toBeCloseTo(11, 8);
  });

  it('clamps playback at project duration', () => {
    expect(previewFrameTime(9.5, 5, 60, 10)).toBe(10);
  });

  it('does not round NTSC-style fractional sequence rates', () => {
    const rate = 30000 / 1001;
    const frame100 = 100 / rate;
    expect(quantizePreviewTime(frame100, rate)).toBeCloseTo(frame100, 12);
    expect(previewFrameTime(0, frame100 + 1e-8, rate, 60)).toBeCloseTo(frame100, 12);
  });

  it('uses tighter sync tolerance at higher frame rates with a safe lower bound', () => {
    expect(previewSyncTolerance(24)).toBeCloseTo(0.0625);
    expect(previewSyncTolerance(60)).toBe(0.025);
    expect(previewSyncTolerance(120)).toBe(0.025);
  });
});
