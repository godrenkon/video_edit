import { describe, expect, it } from 'vitest';
import type { ClipMask } from '../types/editor';
import { applyClipMasks, hasEnabledMasks, maskCoverage } from './clipMasks';

const rect = (patch: Partial<ClipMask> = {}): ClipMask => ({
  id: 'mask-1',
  kind: 'rectangle',
  operation: 'add',
  enabled: true,
  x: 0.5,
  y: 0.5,
  width: 0.5,
  height: 0.5,
  feather: 0,
  invert: false,
  ...patch,
});

function image(width: number, height: number, alpha = 255): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < data.length; index += 4) {
    data[index] = 100;
    data[index + 1] = 120;
    data[index + 2] = 140;
    data[index + 3] = alpha;
  }
  return { data, width, height, colorSpace: 'srgb' } as ImageData;
}

describe('clip masks', () => {
  it('detects only enabled masks', () => {
    expect(hasEnabledMasks([rect()])).toBe(true);
    expect(hasEnabledMasks([rect({ enabled: false })])).toBe(false);
  });

  it('returns full rectangle coverage at center and zero outside', () => {
    const mask = rect();
    expect(maskCoverage(mask, 0.5, 0.5)).toBe(1);
    expect(maskCoverage(mask, 0.05, 0.05)).toBe(0);
  });

  it('supports ellipse coverage and inversion', () => {
    const ellipse = rect({ kind: 'ellipse', width: 0.8, height: 0.4 });
    expect(maskCoverage(ellipse, 0.5, 0.5)).toBe(1);
    expect(maskCoverage(ellipse, 0.9, 0.7)).toBe(0);

    const normal = image(3, 3);
    const inverted = image(3, 3);
    applyClipMasks(normal, [rect({ width: 0.6, height: 0.6 })]);
    applyClipMasks(inverted, [rect({ width: 0.6, height: 0.6, invert: true })]);
    expect(normal.data[(4 * 4) + 3]).toBe(255);
    expect(inverted.data[(4 * 4) + 3]).toBe(0);
  });

  it('combines add and subtract masks deterministically', () => {
    const source = image(5, 1);
    applyClipMasks(source, [
      rect({ width: 1, height: 1 }),
      rect({ id: 'hole', operation: 'subtract', width: 0.2, height: 1 }),
    ]);
    expect(source.data[3]).toBe(255);
    expect(source.data[(2 * 4) + 3]).toBe(0);
    expect(source.data[(4 * 4) + 3]).toBe(255);
  });

  it('intersects subsequent masks with the current matte', () => {
    const source = image(5, 5);
    applyClipMasks(source, [
      rect({ width: 1, height: 0.6 }),
      rect({ id: 'intersect', operation: 'intersect', width: 0.6, height: 1 }),
    ]);
    expect(source.data[((2 * 5 + 2) * 4) + 3]).toBe(255);
    expect(source.data[((0 * 5 + 2) * 4) + 3]).toBe(0);
    expect(source.data[((2 * 5 + 0) * 4) + 3]).toBe(0);
  });

  it('feather creates partial alpha around the mask boundary', () => {
    const coverage = maskCoverage(rect({ width: 0.5, height: 0.5, feather: 0.5 }), 0.75, 0.5);
    expect(coverage).toBeGreaterThan(0);
    expect(coverage).toBeLessThan(1);
  });
});
