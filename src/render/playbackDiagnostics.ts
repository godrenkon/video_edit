export interface PlaybackStepMeasurement {
  elapsedMs: number;
  expectedMs: number;
  droppedFrames: number;
  delayMs: number;
}

export function measurePlaybackStep(previousWallMs: number, currentWallMs: number, fps: number): PlaybackStepMeasurement {
  const rate = Math.max(1, Math.min(240, Math.round(fps || 1)));
  const expectedMs = 1000 / rate;
  const elapsedMs = Math.max(0, currentWallMs - previousWallMs);
  const elapsedFrames = elapsedMs / expectedMs;
  const droppedFrames = Math.max(0, Math.round(elapsedFrames) - 1);
  return {
    elapsedMs,
    expectedMs,
    droppedFrames,
    delayMs: Math.max(0, elapsedMs - expectedMs),
  };
}
