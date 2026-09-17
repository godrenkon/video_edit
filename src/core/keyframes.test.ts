import { describe, expect, it } from 'vitest';
import type { EffectParameter } from '../types/editor';
import { cloneEffectValue, evaluateEffectParameter, interpolateEffectValue, sortedValidKeyframes } from './keyframes';

describe('keyframe helpers', () => {
  it('sorts valid keyframes without mutating the input', () => {
    const input: NonNullable<EffectParameter['keyframes']> = [
      { id: 'b', time: 2, value: 2, interpolation: 'linear' },
      { id: 'invalid', time: -1, value: 9, interpolation: 'linear' },
      { id: 'a', time: 0, value: 0, interpolation: 'linear' },
    ];
    expect(sortedValidKeyframes(input).map((keyframe) => keyframe.id)).toEqual(['a', 'b']);
    expect(input.map((keyframe) => keyframe.id)).toEqual(['b', 'invalid', 'a']);
  });

  it('clones vector values and interpolates compatible vectors', () => {
    const source = [1, 2];
    const clone = cloneEffectValue(source);
    expect(clone).toEqual(source);
    expect(clone).not.toBe(source);
    expect(interpolateEffectValue([0, 10], [10, 20], 0.5)).toEqual([5, 15]);
  });

  it('evaluates before and after the keyframe range using boundary values', () => {
    const parameter: EffectParameter = {
      value: 99,
      keyframes: [
        { id: 'a', time: 1, value: 2, interpolation: 'linear' },
        { id: 'b', time: 3, value: 6, interpolation: 'linear' },
      ],
    };
    expect(evaluateEffectParameter(parameter, 0)).toBe(2);
    expect(evaluateEffectParameter(parameter, 4)).toBe(6);
  });
});
