import { describe, expect, it } from 'vitest';
import { resolveLayerMaskShapes } from './maskGeometry';

describe('mask geometry', () => {
  it('maps normalized rectangles into layer-local pixels', () => {
    expect(resolveLayerMaskShapes([
      { id: 'r', kind: 'rectangle', x: 0.1, y: 0.2, width: 0.5, height: 0.25 },
    ], -100, -50, 200, 100)).toEqual([
      { kind: 'rectangle', x: -80, y: -30, width: 100, height: 25 },
    ]);
  });

  it('maps ellipses to center/radius geometry', () => {
    expect(resolveLayerMaskShapes([
      { id: 'e', kind: 'ellipse', x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
    ], 0, 0, 400, 200)).toEqual([
      { kind: 'ellipse', centerX: 200, centerY: 100, radiusX: 100, radiusY: 50 },
    ]);
  });

  it('returns no geometry when there are no masks or the layer is empty', () => {
    expect(resolveLayerMaskShapes(undefined, 0, 0, 100, 100)).toEqual([]);
    expect(resolveLayerMaskShapes([{ id: 'r', kind: 'rectangle', x: 0, y: 0, width: 1, height: 1 }], 0, 0, 0, 100)).toEqual([]);
  });
});
