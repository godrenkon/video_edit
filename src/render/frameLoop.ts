import { RenderClock } from './clock';
import type { FrameDimensions, RenderFrameRequest, RenderProgress } from './types';

export interface FrameRenderLoopOptions extends FrameDimensions {
  fps: number;
  durationSeconds: number;
  startFrame?: number;
  signal?: AbortSignal;
  onProgress?: (progress: RenderProgress) => void;
  renderFrame: (request: RenderFrameRequest, signal?: AbortSignal) => Promise<void> | void;
  now?: () => number;
}

export interface FrameRenderLoopResult {
  completedFrames: number;
  totalFrames: number;
  elapsedMs: number;
}

export class RenderCancelledError extends Error {
  readonly name = 'RenderCancelledError';

  constructor(message = 'Render cancelled') {
    super(message);
  }
}

export async function runFrameRenderLoop(options: FrameRenderLoopOptions): Promise<FrameRenderLoopResult> {
  const {
    width,
    height,
    fps,
    durationSeconds,
    startFrame = 0,
    signal,
    onProgress,
    renderFrame,
    now = () => performance.now(),
  } = options;

  const clock = new RenderClock(fps);
  const totalFrames = clock.framesForDuration(durationSeconds);
  const startedAt = now();
  let completedFrames = 0;

  assertNotCancelled(signal);

  for (const request of clock.requests(durationSeconds, { width, height }, startFrame)) {
    assertNotCancelled(signal);
    await renderFrame(request, signal);
    assertNotCancelled(signal);

    completedFrames += 1;
    onProgress?.({
      completedFrames,
      totalFrames,
      fraction: totalFrames === 0 ? 1 : completedFrames / totalFrames,
      elapsedMs: Math.max(0, now() - startedAt),
    });
  }

  return {
    completedFrames,
    totalFrames,
    elapsedMs: Math.max(0, now() - startedAt),
  };
}

function assertNotCancelled(signal?: AbortSignal) {
  if (signal?.aborted) {
    const reason = signal.reason;
    throw new RenderCancelledError(typeof reason === 'string' && reason.length > 0 ? reason : undefined);
  }
}
