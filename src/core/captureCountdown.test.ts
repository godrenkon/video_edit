import { describe, expect, it } from 'vitest';
import { normalizeCountdownSeconds, runCaptureCountdown } from './captureCountdown';

describe('capture countdown', () => {
  it('emits a deterministic 3-2-1 sequence and completes', async () => {
    const ticks: Array<number | null> = [];
    const completed = await runCaptureCountdown((value) => ticks.push(value), undefined, 3, async () => undefined);
    expect(completed).toBe(true);
    expect(ticks).toEqual([3, 2, 1, null]);
  });

  it('stops when aborted and clears the visible tick', async () => {
    const controller = new AbortController();
    const ticks: Array<number | null> = [];
    let sleeps = 0;
    const completed = await runCaptureCountdown(
      (value) => ticks.push(value),
      controller.signal,
      3,
      async () => {
        sleeps += 1;
        if (sleeps === 1) controller.abort();
      },
    );
    expect(completed).toBe(false);
    expect(ticks).toEqual([3, null]);
  });

  it('bounds countdown length', () => {
    expect(normalizeCountdownSeconds(-2)).toBe(0);
    expect(normalizeCountdownSeconds(99)).toBe(10);
    expect(normalizeCountdownSeconds(Number.NaN)).toBe(3);
  });
});
