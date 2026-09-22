const DEFAULT_MAX_WIDTH = 960;
const DEFAULT_MAX_HEIGHT = 540;

export function previewCacheFrameIndex(timeSeconds: number, fps: number, duration: number) {
  const rate = Math.max(1, Math.min(240, Math.round(Number.isFinite(fps) ? fps : 30)));
  const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
  const safeTime = Math.max(0, Math.min(safeDuration, Number.isFinite(timeSeconds) ? timeSeconds : 0));
  return Math.max(0, Math.round(safeTime * rate));
}

export function previewCacheDimensions(
  width: number,
  height: number,
  maxWidth = DEFAULT_MAX_WIDTH,
  maxHeight = DEFAULT_MAX_HEIGHT,
) {
  const sourceWidth = Math.max(1, Math.round(Number.isFinite(width) ? width : 1));
  const sourceHeight = Math.max(1, Math.round(Number.isFinite(height) ? height : 1));
  const boundWidth = positivePreviewInt(maxWidth, DEFAULT_MAX_WIDTH);
  const boundHeight = positivePreviewInt(maxHeight, DEFAULT_MAX_HEIGHT);
  const scale = Math.min(1, boundWidth / sourceWidth, boundHeight / sourceHeight);
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

export function positivePreviewInt(value: number | undefined, fallback: number) {
  return Math.max(1, Math.round(Number.isFinite(value) ? Number(value) : fallback));
}
