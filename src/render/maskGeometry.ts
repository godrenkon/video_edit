import type { ClipMask } from '../types/editor';

export type LayerMaskShape =
  | { kind: 'rectangle'; x: number; y: number; width: number; height: number }
  | { kind: 'ellipse'; centerX: number; centerY: number; radiusX: number; radiusY: number };

export function resolveLayerMaskShapes(
  masks: ClipMask[] | undefined,
  x: number,
  y: number,
  width: number,
  height: number,
): LayerMaskShape[] {
  if (!masks?.length || !Number.isFinite(width) || !Number.isFinite(height) || width === 0 || height === 0) return [];

  return masks.map((mask) => {
    const left = x + width * clamp01(mask.x);
    const top = y + height * clamp01(mask.y);
    const maskWidth = width * clamp01(mask.width);
    const maskHeight = height * clamp01(mask.height);

    if (mask.kind === 'ellipse') {
      return {
        kind: 'ellipse' as const,
        centerX: left + maskWidth / 2,
        centerY: top + maskHeight / 2,
        radiusX: Math.abs(maskWidth) / 2,
        radiusY: Math.abs(maskHeight) / 2,
      };
    }

    return {
      kind: 'rectangle' as const,
      x: left,
      y: top,
      width: maskWidth,
      height: maskHeight,
    };
  });
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}
