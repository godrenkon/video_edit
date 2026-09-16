import { describe, expect, it } from 'vitest';
import {
  constrainNormalizedCrop,
  cropToNormalized,
  previewCropLayout,
  resolveCropRectangle,
} from './cropGeometry';

describe('crop geometry', () => {
  it('resolves normalized crop fractions against source dimensions', () => {
    expect(resolveCropRectangle(1920, 1080, { top: 0.1, right: 0.2, bottom: 0.1, left: 0.2 })).toEqual({
      x: 384,
      y: 108,
      width: 1152,
      height: 864,
    });
  });

  it('supports legacy pixel crop values', () => {
    expect(resolveCropRectangle(1920, 1080, { top: 100, right: 200, bottom: 100, left: 200 })).toEqual({
      x: 200,
      y: 100,
      width: 1520,
      height: 880,
    });
    expect(cropToNormalized({ top: 108, right: 192, bottom: 108, left: 192 }, 1920, 1080)).toEqual({
      top: 0.1,
      right: 0.1,
      bottom: 0.1,
      left: 0.1,
    });
  });

  it('computes a cropped contain layout for DOM preview', () => {
    const layout = previewCropLayout(1920, 1080, 1920, 1080, { top: 0, right: 0.25, bottom: 0, left: 0.25 });
    expect(layout).not.toBeNull();
    expect(layout!.frameWidthPercent).toBeCloseTo(50);
    expect(layout!.frameHeightPercent).toBeCloseTo(100);
    expect(layout!.sourceLeftPercent).toBeCloseTo(-50);
    expect(layout!.sourceWidthPercent).toBeCloseTo(200);
  });

  it('prevents opposing normalized edges from removing the entire image', () => {
    expect(constrainNormalizedCrop({ top: 0.8, right: 0.8, bottom: 0.8, left: 0.8 }, 'left')).toEqual({
      top: 0.8,
      right: 0.8,
      bottom: 0.19,
      left: 0.19,
    });
  });
});
