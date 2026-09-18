export function quantizePreviewTime(timeSeconds: number, fps: number) {
  const rate = Math.max(1, Math.min(240, Math.round(fps || 1)));
  const safe = Math.max(0, Number.isFinite(timeSeconds) ? timeSeconds : 0);
  return Math.round(safe * rate) / rate;
}

export function previewFrameTime(
  originSeconds: number,
  elapsedSeconds: number,
  fps: number,
  durationSeconds: number,
) {
  const rate = Math.max(1, Math.min(240, Math.round(fps || 1)));
  const duration = Math.max(0, Number.isFinite(durationSeconds) ? durationSeconds : 0);
  const origin = quantizePreviewTime(originSeconds, rate);
  const elapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const frameIndex = Math.floor((origin + elapsed) * rate + 1e-7);
  return Math.min(duration, frameIndex / rate);
}

export function previewSyncTolerance(fps: number) {
  const rate = Math.max(1, Math.min(240, Math.round(fps || 1)));
  return Math.max(0.025, 1.5 / rate);
}
