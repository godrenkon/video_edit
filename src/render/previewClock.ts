import {
  frameIndexAt,
  frameSyncTolerance,
  frameTime,
  normalizedFrameRate,
  quantizeFrameTime,
} from '../core/timebase';

export function quantizePreviewTime(timeSeconds: number, fps: number) {
  return quantizeFrameTime(timeSeconds, fps);
}

export function previewFrameTime(
  originSeconds: number,
  elapsedSeconds: number,
  fps: number,
  durationSeconds: number,
) {
  const rate = normalizedFrameRate(fps);
  const duration = Math.max(0, Number.isFinite(durationSeconds) ? durationSeconds : 0);
  const origin = quantizeFrameTime(originSeconds, rate);
  const elapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const frameIndex = frameIndexAt(origin + elapsed, rate, 'floor');
  return Math.min(duration, frameTime(frameIndex, rate));
}

export function previewSyncTolerance(fps: number) {
  return frameSyncTolerance(fps);
}
