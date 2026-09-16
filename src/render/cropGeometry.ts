import type { Crop } from '../types/editor';

export interface CropRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PreviewCropLayout {
  frameWidthPercent: number;
  frameHeightPercent: number;
  sourceLeftPercent: number;
  sourceTopPercent: number;
  sourceWidthPercent: number;
  sourceHeightPercent: number;
}

/**
 * Crop accepts normalized fractions when every edge is within 0..1, otherwise
 * values are interpreted as source pixels. Keeping this rule in one place is
 * important so preview and deterministic export crop the exact same rectangle.
 */
export function resolveCropRectangle(width: number, height: number, crop: Crop | null): CropRectangle {
  const safeWidth = Math.max(1, finite(width, 1));
  const safeHeight = Math.max(1, finite(height, 1));
  if (!crop) return { x: 0, y: 0, width: safeWidth, height: safeHeight };

  const values = [crop.top, crop.right, crop.bottom, crop.left];
  const normalized = values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1);
  const factorX = normalized ? safeWidth : 1;
  const factorY = normalized ? safeHeight : 1;
  const top = clamp(crop.top, 0, normalized ? 1 : safeHeight) * factorY;
  const right = clamp(crop.right, 0, normalized ? 1 : safeWidth) * factorX;
  const bottom = clamp(crop.bottom, 0, normalized ? 1 : safeHeight) * factorY;
  const left = clamp(crop.left, 0, normalized ? 1 : safeWidth) * factorX;

  return {
    x: left,
    y: top,
    width: Math.max(0, safeWidth - left - right),
    height: Math.max(0, safeHeight - top - bottom),
  };
}

/**
 * Converts the export crop/contain geometry into percentages usable by the DOM
 * preview. The returned frame is centered in the project and the source is
 * positioned inside an overflow-hidden frame.
 */
export function previewCropLayout(
  sourceWidth: number,
  sourceHeight: number,
  projectWidth: number,
  projectHeight: number,
  crop: Crop | null,
): PreviewCropLayout | null {
  const sourceW = Math.max(1, finite(sourceWidth, 1));
  const sourceH = Math.max(1, finite(sourceHeight, 1));
  const projectW = Math.max(1, finite(projectWidth, 1));
  const projectH = Math.max(1, finite(projectHeight, 1));
  const rect = resolveCropRectangle(sourceW, sourceH, crop);
  if (rect.width <= 0 || rect.height <= 0) return null;

  const fit = Math.min(projectW / rect.width, projectH / rect.height);
  const frameWidth = rect.width * fit;
  const frameHeight = rect.height * fit;

  return {
    frameWidthPercent: frameWidth / projectW * 100,
    frameHeightPercent: frameHeight / projectH * 100,
    sourceLeftPercent: -rect.x / rect.width * 100,
    sourceTopPercent: -rect.y / rect.height * 100,
    sourceWidthPercent: sourceW / rect.width * 100,
    sourceHeightPercent: sourceH / rect.height * 100,
  };
}

export function cropToNormalized(crop: Crop | null | undefined, width: number, height: number): Crop {
  if (!crop) return { top: 0, right: 0, bottom: 0, left: 0 };
  const values = [crop.top, crop.right, crop.bottom, crop.left];
  if (values.every((value) => Number.isFinite(value) && value >= 0 && value <= 1)) {
    return {
      top: clamp(crop.top, 0, 1),
      right: clamp(crop.right, 0, 1),
      bottom: clamp(crop.bottom, 0, 1),
      left: clamp(crop.left, 0, 1),
    };
  }
  const safeWidth = Math.max(1, finite(width, 1));
  const safeHeight = Math.max(1, finite(height, 1));
  return {
    top: clamp(crop.top / safeHeight, 0, 1),
    right: clamp(crop.right / safeWidth, 0, 1),
    bottom: clamp(crop.bottom / safeHeight, 0, 1),
    left: clamp(crop.left / safeWidth, 0, 1),
  };
}

export function constrainNormalizedCrop(crop: Crop, changedEdge?: keyof Crop): Crop {
  const next: Crop = {
    top: clamp(crop.top, 0, 0.99),
    right: clamp(crop.right, 0, 0.99),
    bottom: clamp(crop.bottom, 0, 0.99),
    left: clamp(crop.left, 0, 0.99),
  };
  const maxPair = 0.99;

  if (next.left + next.right > maxPair) {
    if (changedEdge === 'left') next.left = maxPair - next.right;
    else next.right = maxPair - next.left;
  }
  if (next.top + next.bottom > maxPair) {
    if (changedEdge === 'top') next.top = maxPair - next.bottom;
    else next.bottom = maxPair - next.top;
  }

  return next;
}

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
