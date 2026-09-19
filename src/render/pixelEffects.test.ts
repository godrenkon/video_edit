import { describe, expect, it } from 'vitest';
import type { EffectInstance } from '../types/editor';
import { applyChromaKey, applyPixelEffects, applySharpen, hasPixelEffects, resolveChromaKey } from './pixelEffects';

const parameter = (value: number | string) => ({ value });
const effect = (kind: string, parameters: EffectInstance['parameters']): EffectInstance => ({
  id: 'fx-' + kind,
  kind,
  enabled: true,
  parameters,
});

describe('pixel effects', () => {
  it('detects only enabled pixel-processing effects', () => {
    expect(hasPixelEffects([effect('sharpen', { amount: parameter(1) })])).toBe(true);
    expect(hasPixelEffects([{ ...effect('chroma-key', { color: parameter('#00ff00') }), enabled: false }])).toBe(false);
    expect(hasPixelEffects([effect('blur', { radius: parameter(4) })])).toBe(false);
  });

  it('sharpens a center pixel without changing alpha', () => {
    const image = new ImageData(new Uint8ClampedArray([
      0,0,0,255, 0,0,0,255, 0,0,0,255,
      0,0,0,255, 100,100,100,200, 0,0,0,255,
      0,0,0,255, 0,0,0,255, 0,0,0,255,
    ]), 3, 3);
    applySharpen(image, { amount: 1 });
    const center = (1 * 3 + 1) * 4;
    expect(image.data[center]).toBeGreaterThan(100);
    expect(image.data[center + 3]).toBe(200);
  });

  it('keys an exact green pixel and preserves a distant red pixel', () => {
    const image = new ImageData(new Uint8ClampedArray([
      0,255,0,255,
      255,0,0,255,
    ]), 2, 1);
    applyChromaKey(image, { color: [0,255,0], similarity: 0.1, smoothness: 0.05, spill: 0 });
    expect(image.data[3]).toBe(0);
    expect(image.data[7]).toBe(255);
  });

  it('resolves keyframeable chroma controls and falls back to green on invalid colors', () => {
    const resolved = resolveChromaKey(effect('chroma-key', {
      color: parameter('bad'),
      similarity: parameter(0.4),
      smoothness: parameter(0.1),
      spill: parameter(0.6),
    }), 0);
    expect(resolved).toEqual({ color: [0,255,0], similarity: 0.4, smoothness: 0.1, spill: 0.6 });
  });

  it('applies pixel effects in effect-list order', () => {
    const image = new ImageData(new Uint8ClampedArray([
      0,255,0,255, 0,255,0,255, 0,255,0,255,
      0,255,0,255, 0,255,0,255, 0,255,0,255,
      0,255,0,255, 0,255,0,255, 0,255,0,255,
    ]), 3, 3);
    applyPixelEffects(image, [
      effect('sharpen', { amount: parameter(1) }),
      effect('chroma-key', {
        color: parameter('#00ff00'),
        similarity: parameter(0.2),
        smoothness: parameter(0.05),
        spill: parameter(0),
      }),
    ], 0);
    expect(image.data[3]).toBe(0);
    expect(image.data[(4 * 4) + 3]).toBe(0);
  });
});
