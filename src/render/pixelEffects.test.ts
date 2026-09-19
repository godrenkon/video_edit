import { describe, expect, it } from 'vitest';
import type { EffectInstance } from '../types/editor';
import {
  applyChromaKey,
  applyLevels,
  applyLiftGammaGain,
  applyTonalRanges,
  applyPixelEffects,
  applySharpen,
  hasPixelEffects,
  resolveChromaKey,
  resolveLevels,
  resolveLiftGammaGain,
  resolveTonalRanges,
} from './pixelEffects';

const parameter = (value: number | string) => ({ value });
const effect = (kind: string, parameters: EffectInstance['parameters']): EffectInstance => ({
  id: 'fx-' + kind,
  kind,
  enabled: true,
  parameters,
});

function makeImageData(data: Uint8ClampedArray, width: number, height: number): ImageData {
  return { data, width, height, colorSpace: 'srgb' } as ImageData;
}

describe('pixel effects', () => {
  it('detects only enabled pixel-processing effects', () => {
    expect(hasPixelEffects([effect('sharpen', { amount: parameter(1) })])).toBe(true);
    expect(hasPixelEffects([{ ...effect('chroma-key', { color: parameter('#00ff00') }), enabled: false }])).toBe(false);
    expect(hasPixelEffects([effect('levels', {
      inputBlack: parameter(0), inputWhite: parameter(1), gamma: parameter(1), outputBlack: parameter(0), outputWhite: parameter(1),
    })])).toBe(true);
    expect(hasPixelEffects([effect('lift-gamma-gain', {
      lift: parameter(0), gamma: parameter(1), gain: parameter(1),
    })])).toBe(true);
    expect(hasPixelEffects([effect('tonal-ranges', {
      shadows: parameter(0), midtones: parameter(0), highlights: parameter(0),
    })])).toBe(true);
    expect(hasPixelEffects([effect('blur', { radius: parameter(4) })])).toBe(false);
  });

  it('sharpens a center pixel without changing alpha', () => {
    const image = makeImageData(new Uint8ClampedArray([
      0,0,0,255, 0,0,0,255, 0,0,0,255,
      0,0,0,255, 100,100,100,200, 0,0,0,255,
      0,0,0,255, 0,0,0,255, 0,0,0,255,
    ]), 3, 3);
    applySharpen(image, { amount: 1 });
    const center = (1 * 3 + 1) * 4;
    expect(image.data[center]).toBeGreaterThan(100);
    expect(image.data[center + 3]).toBe(200);
  });

  it('maps input/output levels without changing alpha', () => {
    const image = makeImageData(new Uint8ClampedArray([
      0, 64, 128, 77,
      192, 224, 255, 155,
    ]), 2, 1);
    applyLevels(image, {
      inputBlack: 0.25,
      inputWhite: 0.75,
      gamma: 1,
      outputBlack: 0.1,
      outputWhite: 0.9,
    });
    expect(image.data[0]).toBe(26);
    expect(image.data[1]).toBe(26);
    expect(image.data[2]).toBeGreaterThan(120);
    expect(image.data[4]).toBe(230);
    expect(image.data[5]).toBe(230);
    expect(image.data[6]).toBe(230);
    expect(image.data[3]).toBe(77);
    expect(image.data[7]).toBe(155);
  });

  it('resolves animated levels controls and gamma brightens midtones above one', () => {
    const levels = effect('levels', {
      inputBlack: { value: 0, keyframes: [
        { id: 'a', time: 0, value: 0, interpolation: 'linear' },
        { id: 'b', time: 2, value: 0.2, interpolation: 'linear' },
      ] },
      inputWhite: parameter(1),
      gamma: parameter(2),
      outputBlack: parameter(0),
      outputWhite: parameter(1),
    });
    const resolved = resolveLevels(levels, 1);
    expect(resolved.inputBlack).toBeCloseTo(0.1, 8);
    expect(resolved.gamma).toBe(2);

    const image = makeImageData(new Uint8ClampedArray([128,128,128,255]), 1, 1);
    applyLevels(image, { inputBlack: 0, inputWhite: 1, gamma: 2, outputBlack: 0, outputWhite: 1 });
    expect(image.data[0]).toBeGreaterThan(128);
  });

  it('keeps invalid overlapping levels ranges numerically safe', () => {
    const resolved = resolveLevels(effect('levels', {
      inputBlack: parameter(0.9),
      inputWhite: parameter(0.2),
      gamma: parameter(0),
      outputBlack: parameter(0.8),
      outputWhite: parameter(0.1),
    }), 0);
    expect(resolved.inputWhite).toBeGreaterThan(resolved.inputBlack);
    expect(resolved.gamma).toBe(0.1);
    expect(resolved.outputWhite).toBe(resolved.outputBlack);
  });

  it('applies lift gamma gain while preserving alpha and neutral settings', () => {
    const neutral = makeImageData(new Uint8ClampedArray([32,128,224,77]), 1, 1);
    applyLiftGammaGain(neutral, { lift: 0, gamma: 1, gain: 1 });
    expect([...neutral.data]).toEqual([32,128,224,77]);

    const adjusted = makeImageData(new Uint8ClampedArray([32,128,224,155]), 1, 1);
    applyLiftGammaGain(adjusted, { lift: 0.1, gamma: 2, gain: 1.1 });
    expect(adjusted.data[0]).toBeGreaterThan(32);
    expect(adjusted.data[1]).toBeGreaterThan(128);
    expect(adjusted.data[2]).toBeGreaterThanOrEqual(224);
    expect(adjusted.data[3]).toBe(155);
  });

  it('resolves animated lift gamma gain values and clamps unsafe ranges', () => {
    const resolved = resolveLiftGammaGain(effect('lift-gamma-gain', {
      lift: {
        value: 0,
        keyframes: [
          { id: 'a', time: 0, value: -0.5, interpolation: 'linear' },
          { id: 'b', time: 2, value: 0.5, interpolation: 'linear' },
        ],
      },
      gamma: parameter(99),
      gain: parameter(-4),
    }), 1);
    expect(resolved.lift).toBeCloseTo(0, 8);
    expect(resolved.gamma).toBe(5);
    expect(resolved.gain).toBe(0);
  });

  it('targets shadows mids and highlights by luminance while preserving alpha', () => {
    const shadows = makeImageData(new Uint8ClampedArray([
      32,32,32,101,
      128,128,128,102,
      224,224,224,103,
    ]), 3, 1);
    applyTonalRanges(shadows, { shadows: 0.5, midtones: 0, highlights: 0 });
    const shadowDelta = shadows.data[0] - 32;
    const midDelta = shadows.data[4] - 128;
    const highlightDelta = shadows.data[8] - 224;
    expect(shadowDelta).toBeGreaterThan(midDelta);
    expect(midDelta).toBeGreaterThan(highlightDelta);
    expect(shadows.data[3]).toBe(101);
    expect(shadows.data[7]).toBe(102);
    expect(shadows.data[11]).toBe(103);

    const mids = makeImageData(new Uint8ClampedArray([
      32,32,32,255,
      128,128,128,255,
      224,224,224,255,
    ]), 3, 1);
    applyTonalRanges(mids, { shadows: 0, midtones: 0.5, highlights: 0 });
    expect(mids.data[4] - 128).toBeGreaterThan(mids.data[0] - 32);
    expect(mids.data[4] - 128).toBeGreaterThan(mids.data[8] - 224);

    const highlights = makeImageData(new Uint8ClampedArray([
      32,32,32,255,
      128,128,128,255,
      224,224,224,255,
    ]), 3, 1);
    applyTonalRanges(highlights, { shadows: 0, midtones: 0, highlights: -0.5 });
    expect(Math.abs(highlights.data[8] - 224)).toBeGreaterThan(Math.abs(highlights.data[4] - 128));
    expect(Math.abs(highlights.data[4] - 128)).toBeGreaterThan(Math.abs(highlights.data[0] - 32));
  });

  it('resolves animated tonal-range controls and clamps them safely', () => {
    const resolved = resolveTonalRanges(effect('tonal-ranges', {
      shadows: {
        value: 0,
        keyframes: [
          { id: 'a', time: 0, value: -1, interpolation: 'linear' },
          { id: 'b', time: 2, value: 1, interpolation: 'linear' },
        ],
      },
      midtones: parameter(5),
      highlights: parameter(-5),
    }), 1);
    expect(resolved.shadows).toBeCloseTo(0, 8);
    expect(resolved.midtones).toBe(1);
    expect(resolved.highlights).toBe(-1);
  });

  it('keys an exact green pixel and preserves a distant red pixel', () => {
    const image = makeImageData(new Uint8ClampedArray([
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
    const image = makeImageData(new Uint8ClampedArray([
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
