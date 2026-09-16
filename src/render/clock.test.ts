import { describe, expect, it } from 'vitest';
import { RenderClock } from './clock';

const size = { width: 1920, height: 1080 };

describe('RenderClock', () => {
  it('creates deterministic integer microsecond timestamps from frame indices', () => {
    const clock = new RenderClock(30);

    expect(clock.timestampUs(0)).toBe(0);
    expect(clock.timestampUs(1)).toBe(33_333);
    expect(clock.timestampUs(2)).toBe(66_667);
    expect(clock.timestampUs(30)).toBe(1_000_000);
  });

  it('keeps adjacent frame durations contiguous even when one frame is rounded', () => {
    const clock = new RenderClock(30);
    const first = clock.frameRequest(1, size);
    const second = clock.frameRequest(2, size);

    expect(first.timestampUs + first.durationUs).toBe(second.timestampUs);
    expect(first.durationUs).toBe(33_334);
    expect(second.durationUs).toBe(33_333);
  });

  it('plans the exact number of frames needed for a duration', () => {
    const clock = new RenderClock(60);

    expect(clock.framesForDuration(0)).toBe(0);
    expect(clock.framesForDuration(1)).toBe(60);
    expect(clock.framesForDuration(1.01)).toBe(61);
    expect([...clock.requests(0.05, size)].map((request) => request.frameIndex)).toEqual([0, 1, 2]);
  });

  it('can start a deterministic request range at a non-zero frame', () => {
    const clock = new RenderClock(25);
    const requests = [...clock.requests(0.08, size, 10)];

    expect(requests.map((request) => request.frameIndex)).toEqual([10, 11]);
    expect(requests[0].timestampUs).toBe(400_000);
  });

  it('rejects invalid fps, frame indices and dimensions early', () => {
    expect(() => new RenderClock(0)).toThrow(RangeError);
    expect(() => new RenderClock(Number.NaN)).toThrow(RangeError);

    const clock = new RenderClock(30);
    expect(() => clock.frameRequest(-1, size)).toThrow(RangeError);
    expect(() => clock.frameRequest(0.5, size)).toThrow(RangeError);
    expect(() => clock.frameRequest(0, { width: 0, height: 1080 })).toThrow(RangeError);
  });
});
