import { describe, expect, it } from 'vitest';
import { measurePlaybackStep } from './playbackDiagnostics';

describe('playback diagnostics', () => {
  it('reports an on-time frame without drops', () => {
    const result = measurePlaybackStep(1000, 1033.333, 30);
    expect(result.droppedFrames).toBe(0);
    expect(result.delayMs).toBeCloseTo(0, 2);
  });

  it('estimates skipped presentation frames from long frame intervals', () => {
    const result = measurePlaybackStep(1000, 1100, 30);
    expect(result.droppedFrames).toBe(2);
    expect(result.delayMs).toBeCloseTo(66.6667, 3);
  });

  it('clamps invalid fps into a safe range', () => {
    expect(measurePlaybackStep(0, 1000 / 240, 999).expectedMs).toBeCloseTo(1000 / 240, 8);
  });
});
