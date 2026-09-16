import { describe, expect, it } from 'vitest';
import { RenderCancelledError, runFrameRenderLoop } from './frameLoop';

const base = {
  width: 1920,
  height: 1080,
  fps: 30,
};

describe('runFrameRenderLoop', () => {
  it('renders every frame exactly once in deterministic order', async () => {
    const frames: number[] = [];
    const result = await runFrameRenderLoop({
      ...base,
      durationSeconds: 0.1,
      renderFrame: (request) => {
        frames.push(request.frameIndex);
      },
    });

    expect(frames).toEqual([0, 1, 2]);
    expect(result.completedFrames).toBe(3);
    expect(result.totalFrames).toBe(3);
  });

  it('supports non-zero start frames without changing frame spacing', async () => {
    const timestamps: number[] = [];
    await runFrameRenderLoop({
      ...base,
      durationSeconds: 2 / 30,
      startFrame: 90,
      renderFrame: (request) => {
        timestamps.push(request.timestampUs);
      },
    });

    expect(timestamps).toEqual([3_000_000, 3_033_333]);
  });

  it('reports monotonic progress ending at one', async () => {
    const progress: number[] = [];
    let now = 100;
    const result = await runFrameRenderLoop({
      ...base,
      durationSeconds: 0.1,
      now: () => now,
      renderFrame: () => {
        now += 5;
      },
      onProgress: (value) => progress.push(value.fraction),
    });

    expect(progress).toEqual([1 / 3, 2 / 3, 1]);
    expect(result.elapsedMs).toBe(15);
  });

  it('stops before starting when already cancelled', async () => {
    const controller = new AbortController();
    controller.abort('user cancelled');
    let calls = 0;

    await expect(runFrameRenderLoop({
      ...base,
      durationSeconds: 1,
      signal: controller.signal,
      renderFrame: () => {
        calls += 1;
      },
    })).rejects.toMatchObject({ name: 'RenderCancelledError', message: 'user cancelled' });

    expect(calls).toBe(0);
  });

  it('stops between frames when cancellation happens during rendering', async () => {
    const controller = new AbortController();
    const frames: number[] = [];

    await expect(runFrameRenderLoop({
      ...base,
      durationSeconds: 1,
      signal: controller.signal,
      renderFrame: (request) => {
        frames.push(request.frameIndex);
        if (request.frameIndex === 1) controller.abort();
      },
    })).rejects.toBeInstanceOf(RenderCancelledError);

    expect(frames).toEqual([0, 1]);
  });

  it('handles zero duration without invoking the renderer', async () => {
    let calls = 0;
    const result = await runFrameRenderLoop({
      ...base,
      durationSeconds: 0,
      renderFrame: () => {
        calls += 1;
      },
    });

    expect(calls).toBe(0);
    expect(result).toMatchObject({ completedFrames: 0, totalFrames: 0 });
  });
});
