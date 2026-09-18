import { describe, expect, it } from 'vitest';
import type { EffectInstance, EffectParameter } from '../types/editor';
import {
  canvasFilterForEffects,
  evaluateEffectParameter,
  isCanvasFilterEffectSupported,
  isVisualEffectSupported,
  resolveVignetteEffects,
  vignetteCssBackground,
} from './effectEvaluation';

const parameter = (value: number, keyframes?: EffectParameter['keyframes']): EffectParameter => ({ value, keyframes });

const effect = (kind: string, parameters: EffectInstance['parameters']): EffectInstance => ({
  id: `fx-${kind}`,
  kind,
  enabled: true,
  parameters,
});

describe('effect evaluation', () => {
  it('interpolates numeric keyframes linearly', () => {
    const value = evaluateEffectParameter(parameter(0, [
      { id: 'a', time: 0, value: 0, interpolation: 'linear' },
      { id: 'b', time: 2, value: 10, interpolation: 'linear' },
    ]), 0.5);
    expect(value).toBe(2.5);
  });

  it('holds values for hold interpolation', () => {
    const value = evaluateEffectParameter(parameter(0, [
      { id: 'a', time: 0, value: 2, interpolation: 'hold' },
      { id: 'b', time: 1, value: 9, interpolation: 'linear' },
    ]), 0.9);
    expect(value).toBe(2);
  });

  it('uses deterministic smooth interpolation for bezier keyframes', () => {
    const value = evaluateEffectParameter(parameter(0, [
      { id: 'a', time: 0, value: 0, interpolation: 'bezier' },
      { id: 'b', time: 1, value: 1, interpolation: 'linear' },
    ]), 0.25);
    expect(value).toBeCloseTo(0.15625, 6);
  });

  it('interpolates numeric vectors and keeps nonnumeric values discrete', () => {
    const vector: EffectParameter = {
      value: [0, 0],
      keyframes: [
        { id: 'a', time: 0, value: [0, 10], interpolation: 'linear' },
        { id: 'b', time: 1, value: [10, 20], interpolation: 'linear' },
      ],
    };
    expect(evaluateEffectParameter(vector, 0.5)).toEqual([5, 15]);

    const color: EffectParameter = {
      value: '#000000',
      keyframes: [
        { id: 'a', time: 0, value: '#000000', interpolation: 'linear' },
        { id: 'b', time: 1, value: '#ffffff', interpolation: 'linear' },
      ],
    };
    expect(evaluateEffectParameter(color, 0.5)).toBe('#000000');
  });

  it('builds one Preview/Canvas-compatible filter chain', () => {
    const filter = canvasFilterForEffects([
      effect('brightness-contrast', { brightness: parameter(0.2), contrast: parameter(1.25) }),
      effect('saturation', { saturation: parameter(1.4) }),
      effect('blur', { radius: parameter(3) }),
      effect('drop-shadow', {
        color: { value: '#000000' }, opacity: parameter(0.5), distance: parameter(10), angle: parameter(0), blur: parameter(4),
      }),
    ], 0);
    expect(filter).toContain('brightness(1.2)');
    expect(filter).toContain('contrast(1.25)');
    expect(filter).toContain('saturate(1.4)');
    expect(filter).toContain('blur(3px)');
    expect(filter).toContain('drop-shadow(10px 0px 4px rgba(0,0,0,0.5))');
  });

  it('reports filter-backed and overlay-backed visual effects separately', () => {
    expect(isCanvasFilterEffectSupported('blur')).toBe(true);
    expect(isCanvasFilterEffectSupported('vignette')).toBe(false);
    expect(isVisualEffectSupported('vignette')).toBe(true);
    expect(isVisualEffectSupported('chroma-key')).toBe(false);
  });

  it('resolves vignette parameters and keyframes for Preview/export overlays', () => {
    const vignettes = resolveVignetteEffects([
      effect('vignette', {
        amount: parameter(0, [
          { id: 'a', time: 0, value: 0, interpolation: 'linear' },
          { id: 'b', time: 2, value: 0.8, interpolation: 'linear' },
        ]),
        size: parameter(0.75),
        softness: parameter(0.5),
      }),
    ], 1);
    expect(vignettes).toHaveLength(1);
    expect(vignettes[0]).toMatchObject({
      amount: 0.4,
      size: 0.75,
      softness: 0.5,
      start: 0.5,
      end: 1,
      color: 'black',
      alpha: 0.4,
    });
    expect(vignetteCssBackground(vignettes[0])).toContain('rgba(0,0,0,0.4)');
  });

  it('uses a white edge for negative vignette amount and skips zero amount', () => {
    const bright = resolveVignetteEffects([
      effect('vignette', {
        amount: parameter(-0.5),
        size: parameter(0.4),
        softness: parameter(0.2),
      }),
    ], 0);
    expect(bright[0]).toMatchObject({ color: 'white', alpha: 0.5, end: 0.5 });
    expect(bright[0].start).toBeCloseTo(0.3, 8);
    expect(resolveVignetteEffects([
      effect('vignette', { amount: parameter(0), size: parameter(0.75), softness: parameter(0.5) }),
    ], 0)).toEqual([]);
  });
});
