import { describe, expect, it } from 'vitest';
import type { Clip } from '../types/editor';
import { thumbnailTimes } from './TimelineThumbnailStrip';

function clip(patch: Partial<Clip> = {}): Clip {
  return {
    id: 'clip',
    kind: 'asset',
    name: 'Clip',
    assetId: 'asset',
    start: 10,
    duration: 4,
    inPoint: 2,
    volume: 1,
    muted: false,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    speed: 1,
    reverse: false,
    effects: [],
    ...patch,
  };
}

describe('timeline thumbnail planning', () => {
  it('uses one midpoint frame for narrow clips', () => {
    expect(thumbnailTimes(clip(), 20, 20)).toEqual([4]);
  });

  it('adds bounded thumbnail samples as visual width grows', () => {
    const times = thumbnailTimes(clip(), 120, 20);
    expect(times.length).toBeGreaterThan(1);
    expect(times.length).toBeLessThanOrEqual(8);
    expect(times[0]).toBeGreaterThan(2);
    expect(times.at(-1)).toBeLessThan(6);
  });

  it('maps speed and reverse through the shared source-time evaluator', () => {
    const forward = thumbnailTimes(clip({ speed: 2 }), 120, 20);
    const reverse = thumbnailTimes(clip({ speed: 2, reverse: true }), 120, 20);
    expect(forward[0]).toBeLessThan(forward.at(-1)!);
    expect(reverse[0]).toBeGreaterThan(reverse.at(-1)!);
    expect(reverse[0]).toBeCloseTo(forward.at(-1)!, 8);
  });

  it('clamps samples to the available asset duration', () => {
    const times = thumbnailTimes(clip({ inPoint: 8, speed: 4 }), 120, 9);
    expect(times.every((time) => time >= 0 && time <= 9)).toBe(true);
  });

  it('returns no samples for invalid media duration', () => {
    expect(thumbnailTimes(clip(), 120, 0)).toEqual([]);
  });
});
