import { describe, expect, it } from 'vitest';
import type { EffectInstance, EffectParameterValue } from '../types/editor';
import {
  applyGrain,
  applyHueShift,
  applyLumaKey,
  applyPixelate,
  hasPixelEffects,
  resolveGrain,
  resolveHueShift,
  resolveLumaKey,
  resolvePixelate,
} from './pixelEffects';

const parameter = (value: EffectParameterValue) => ({ value });
const effect = (kind: string, parameters: EffectInstance['parameters']): EffectInstance => ({
  id: `fx-${kind}`,
  kind,
  enabled: true,
  parameters,
});

function makeImageData(data: Uint8ClampedArray, width: number, height: number): ImageData {
  return { data, width, height, colorSpace: 'srgb' } as ImageData;
}

describe('advanced pixel effects', () => {
  it('connects the added effects to pixel processing', () => {
    expect(hasPixelEffects([effect('luma-key', {})])).toBe(true);
    expect(hasPixelEffects([effect('hue-shift', {})])).toBe(true);
    expect(hasPixelEffects([effect('pixelate', {})])).toBe(true);
    expect(hasPixelEffects([effect('grain', {})])).toBe(true);
  });

  it('resolves and clamps new effect parameters', () => {
    expect(resolveLumaKey(effect('luma-key', {
      threshold: parameter(2),
      softness: parameter(-1),
      invert: parameter(true),
    }), 0)).toEqual({ threshold: 1, softness: 0, invert: true });

    expect(resolveHueShift(effect('hue-shift', { degrees: parameter(999) }), 0)).toEqual({ degrees: 180 });
    expect(resolvePixelate(effect('pixelate', { size: parameter(3.6) }), 0)).toEqual({ size: 4 });
    expect(resolveGrain(effect('grain', { amount: parameter(2), seed: parameter(12.7) }), 0))
      .toEqual({ amount: 1, seed: 13 });
  });

  it('luma key removes dark pixels while preserving bright pixels', () => {
    const image = makeImageData(new Uint8ClampedArray([
      0, 0, 0, 255,
      255, 255, 255, 200,
    ]), 2, 1);

    applyLumaKey(image, { threshold: 0.5, softness: 0, invert: false });
    expect(image.data[3]).toBe(0);
    expect(image.data[7]).toBe(200);
  });

  it('luma key can invert the matte', () => {
    const image = makeImageData(new Uint8ClampedArray([
      0, 0, 0, 255,
      255, 255, 255, 255,
    ]), 2, 1);

    applyLumaKey(image, { threshold: 0.5, softness: 0, invert: true });
    expect(image.data[3]).toBe(255);
    expect(image.data[7]).toBe(0);
  });

  it('shifts red by 120 degrees to green while preserving alpha', () => {
    const image = makeImageData(new Uint8ClampedArray([255, 0, 0, 173]), 1, 1);
    applyHueShift(image, { degrees: 120 });
    expect(image.data[0]).toBeLessThanOrEqual(1);
    expect(image.data[1]).toBeGreaterThanOrEqual(254);
    expect(image.data[2]).toBeLessThanOrEqual(1);
    expect(image.data[3]).toBe(173);
  });

  it('pixelates by averaging each block including alpha', () => {
    const image = makeImageData(new Uint8ClampedArray([
      0, 0, 0, 0,
      100, 100, 100, 100,
      200, 200, 200, 200,
      255, 255, 255, 255,
    ]), 2, 2);

    applyPixelate(image, { size: 2 });
    for (let index = 0; index < image.data.length; index += 4) {
      expect(image.data[index]).toBe(139);
      expect(image.data[index + 1]).toBe(139);
      expect(image.data[index + 2]).toBe(139);
      expect(image.data[index + 3]).toBe(139);
    }
  });

  it('grain is deterministic for the same seed and never changes alpha', () => {
    const source = new Uint8ClampedArray([
      128, 128, 128, 10,
      128, 128, 128, 20,
      128, 128, 128, 30,
    ]);
    const first = makeImageData(new Uint8ClampedArray(source), 3, 1);
    const second = makeImageData(new Uint8ClampedArray(source), 3, 1);

    applyGrain(first, { amount: 0.5, seed: 42 });
    applyGrain(second, { amount: 0.5, seed: 42 });

    expect(Array.from(first.data)).toEqual(Array.from(second.data));
    expect([first.data[3], first.data[7], first.data[11]]).toEqual([10, 20, 30]);
    expect(Array.from(first.data)).not.toEqual(Array.from(source));
  });

  it('zero grain and one-pixel pixelation are exact no-ops', () => {
    const source = new Uint8ClampedArray([4, 8, 12, 16, 20, 24, 28, 32]);
    const image = makeImageData(new Uint8ClampedArray(source), 2, 1);
    applyGrain(image, { amount: 0, seed: 1 });
    applyPixelate(image, { size: 1 });
    expect(Array.from(image.data)).toEqual(Array.from(source));
  });
});
