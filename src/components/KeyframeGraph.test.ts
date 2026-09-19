import { describe, expect, it } from 'vitest';
import { quantizeGraphTime, timeToX, valueToY, xToTime, yToValue } from './KeyframeGraph';

describe('keyframe graph geometry', () => {
  it('round-trips time through graph coordinates', () => {
    const x = timeToX(2.5, 10);
    expect(xToTime(x, 10)).toBeCloseTo(2.5, 8);
  });

  it('round-trips values and clamps outside the graph', () => {
    const y = valueToY(0.25, -1, 1);
    expect(yToValue(y, -1, 1)).toBeCloseTo(0.25, 8);
    expect(yToValue(-100, 0, 1)).toBe(1);
    expect(yToValue(1000, 0, 1)).toBe(0);
  });

  it('quantizes dragged times to project frames', () => {
    expect(quantizeGraphTime(1.017, 30, 5)).toBeCloseTo(1.0333333333, 8);
    expect(quantizeGraphTime(-3, 30, 5)).toBe(0);
    expect(quantizeGraphTime(20, 30, 5)).toBe(5);
  });
});
