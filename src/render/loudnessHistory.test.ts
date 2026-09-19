import { describe, expect, it } from 'vitest';
import {
  integratedLoudness,
  loudnessAverage,
  meanSquareFromLoudness,
  shortTermLoudness,
  trimLoudnessHistory,
} from './loudnessHistory';

describe('loudness history', () => {
  it('round-trips loudness energy closely through averaging', () => {
    expect(meanSquareFromLoudness(-23)).toBeGreaterThan(0);
    expect(loudnessAverage([-23, -23])).toBeCloseTo(-23, 8);
  });

  it('uses only the trailing 3-second window for short-term loudness', () => {
    const points = [
      { timeMs: 0, lufs: -10 },
      { timeMs: 1500, lufs: -30 },
      { timeMs: 3500, lufs: -20 },
      { timeMs: 4500, lufs: -20 },
    ];
    expect(shortTermLoudness(points, 4500, 3000)).toBeCloseTo(
      loudnessAverage([-30, -20, -20]),
      8,
    );
  });

  it('applies absolute and relative gates to integrated loudness', () => {
    const value = integratedLoudness([-90, -24, -24, -24, -60]);
    expect(value).toBeCloseTo(-24, 1);
  });

  it('returns silence when no block survives the absolute gate', () => {
    expect(integratedLoudness([-90, -80, -71])).toBe(-120);
  });

  it('trims old realtime history while retaining the active window', () => {
    const points = [
      { timeMs: 0, lufs: -20 },
      { timeMs: 1000, lufs: -20 },
      { timeMs: 5000, lufs: -20 },
    ];
    expect(trimLoudnessHistory(points, 5000, 3000).map((point) => point.timeMs)).toEqual([1000, 5000]);
  });
});
