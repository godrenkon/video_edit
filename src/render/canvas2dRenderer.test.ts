import { describe, expect, it } from 'vitest';
import { blendModeToCanvas, resolveCropRectangle } from './canvas2dRenderer';

describe('canvas renderer helpers', () => {
  it('maps editor blend modes to Canvas 2D operations', () => {
    expect(blendModeToCanvas('normal')).toBe('source-over');
    expect(blendModeToCanvas('add')).toBe('lighter');
    expect(blendModeToCanvas('multiply')).toBe('multiply');
    expect(blendModeToCanvas('screen')).toBe('screen');
  });

  it('keeps the full source when no crop is set', () => {
    expect(resolveCropRectangle(1920, 1080, null)).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it('supports normalized crop values', () => {
    expect(resolveCropRectangle(1000, 500, { top: 0.1, right: 0.2, bottom: 0.1, left: 0.2 }))
      .toEqual({ x: 200, y: 50, width: 600, height: 400 });
  });

  it('supports pixel crop values and clamps oversized edges safely', () => {
    expect(resolveCropRectangle(100, 80, { top: 10, right: 20, bottom: 10, left: 5 }))
      .toEqual({ x: 5, y: 10, width: 75, height: 60 });
    expect(resolveCropRectangle(100, 80, { top: 0, right: 1000, bottom: 0, left: 0 }).width).toBe(0);
  });
});
