const DEFAULT_FPS = 30;
const MIN_FPS = 1;
const MAX_FPS = 240;
const FRAME_EPSILON = 1e-9;

/**
 * Keeps fractional sequence rates such as 23.976/29.97/59.94 intact.
 * Do not round the project rate: frame quantization, transport and preview
 * must all share the exact same timebase.
 */
export function normalizedFrameRate(fps: number) {
  if (!Number.isFinite(fps)) return DEFAULT_FPS;
  return Math.max(MIN_FPS, Math.min(MAX_FPS, fps));
}

export function frameDuration(fps: number) {
  return 1 / normalizedFrameRate(fps);
}

export function frameIndexAt(
  timeSeconds: number,
  fps: number,
  mode: 'nearest' | 'floor' | 'ceil' = 'nearest',
) {
  const rate = normalizedFrameRate(fps);
  const safe = Math.max(0, Number.isFinite(timeSeconds) ? timeSeconds : 0);
  const scaled = safe * rate;
  if (mode === 'floor') return Math.max(0, Math.floor(scaled + FRAME_EPSILON));
  if (mode === 'ceil') return Math.max(0, Math.ceil(scaled - FRAME_EPSILON));
  return Math.max(0, Math.round(scaled));
}

export function frameTime(frameIndex: number, fps: number) {
  const rate = normalizedFrameRate(fps);
  const safeFrame = Math.max(0, Number.isFinite(frameIndex) ? Math.trunc(frameIndex) : 0);
  return safeFrame / rate;
}

export function quantizeFrameTime(
  timeSeconds: number,
  fps: number,
  mode: 'nearest' | 'floor' | 'ceil' = 'nearest',
) {
  return frameTime(frameIndexAt(timeSeconds, fps, mode), fps);
}

export function frameSyncTolerance(fps: number) {
  return Math.max(0.025, 1.5 * frameDuration(fps));
}

export function isSameFrame(aSeconds: number, bSeconds: number, fps: number) {
  return frameIndexAt(aSeconds, fps) === frameIndexAt(bSeconds, fps);
}
