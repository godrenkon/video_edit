import type { ClipMask } from '../types/editor';

export function hasEnabledMasks(masks: ClipMask[] | undefined) {
  return Boolean(masks?.some((mask) => mask.enabled));
}

export function applyClipMasks(image: ImageData, masks: ClipMask[] | undefined) {
  const active = masks?.filter((mask) => mask.enabled) ?? [];
  if (active.length === 0 || image.width <= 0 || image.height <= 0) return image;

  const data = image.data;
  const width = image.width;
  const height = image.height;
  const firstOperation = active[0]?.operation;
  const startCoverage = firstOperation === 'subtract' || firstOperation === 'intersect' ? 1 : 0;

  for (let y = 0; y < height; y += 1) {
    const ny = (y + 0.5) / height;
    for (let x = 0; x < width; x += 1) {
      const nx = (x + 0.5) / width;
      let coverage = startCoverage;

      for (const mask of active) {
        let shape = maskCoverage(mask, nx, ny);
        if (mask.invert) shape = 1 - shape;

        if (mask.operation === 'add') coverage = Math.max(coverage, shape);
        else if (mask.operation === 'subtract') coverage *= 1 - shape;
        else coverage *= shape;
      }

      const index = (y * width + x) * 4 + 3;
      data[index] = clampByte(data[index] * clamp01(coverage));
    }
  }

  return image;
}

export function maskCoverage(mask: ClipMask, x: number, y: number) {
  const centerX = clamp01(mask.x);
  const centerY = clamp01(mask.y);
  const width = clamp(mask.width, 0.001, 2);
  const height = clamp(mask.height, 0.001, 2);
  const feather = clamp(mask.feather, 0, 1);
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const dx = Math.abs(x - centerX);
  const dy = Math.abs(y - centerY);

  let signedDistance: number;
  if (mask.kind === 'ellipse') {
    const qx = dx / Math.max(1e-6, halfWidth);
    const qy = dy / Math.max(1e-6, halfHeight);
    const radial = Math.sqrt(qx * qx + qy * qy);
    signedDistance = (1 - radial) * Math.min(halfWidth, halfHeight);
  } else {
    const insideX = halfWidth - dx;
    const insideY = halfHeight - dy;
    if (insideX >= 0 && insideY >= 0) {
      signedDistance = Math.min(insideX, insideY);
    } else {
      const outsideX = Math.max(0, -insideX);
      const outsideY = Math.max(0, -insideY);
      signedDistance = -Math.hypot(outsideX, outsideY);
    }
  }

  if (feather <= 1e-9) return signedDistance >= 0 ? 1 : 0;

  const featherDistance = Math.max(1e-6, Math.min(width, height) * 0.5 * feather);
  return smoothstep(-featherDistance, featherDistance, signedDistance);
}

function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge1 <= edge0) return value < edge0 ? 0 : 1;
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)));
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
