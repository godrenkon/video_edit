import { describe, expect, it } from 'vitest';
import { clipIntersectsTimelineWindow, timelineVisibleWindow, visibleSecondTicks } from './timelineVirtualization';

describe('timeline virtualization', () => {
  it('adds one viewport of overscan on both sides', () => {
    expect(timelineVisibleWindow(1000, 500, 100, 60)).toEqual({ start: 5, end: 20 });
  });

  it('clamps the visible window to project duration', () => {
    expect(timelineVisibleWindow(0, 800, 40, 10)).toEqual({ start: 0, end: 10 });
  });

  it('keeps clips touching either visible boundary', () => {
    const window = { start: 10, end: 20 };
    expect(clipIntersectsTimelineWindow({ start: 5, duration: 5 }, window)).toBe(true);
    expect(clipIntersectsTimelineWindow({ start: 20, duration: 2 }, window)).toBe(true);
    expect(clipIntersectsTimelineWindow({ start: 0, duration: 9.9 }, window)).toBe(false);
  });

  it('creates only ticks required for the current window', () => {
    expect(visibleSecondTicks({ start: 9.2, end: 12.1 }, 100)).toEqual([9, 10, 11, 12, 13]);
  });
});
