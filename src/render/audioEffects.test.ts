import { describe, expect, it } from 'vitest';
import type { EffectInstance } from '../types/editor';
import {
  createAudioEffectState,
  isAudioEffectSupported,
  isRealtimeAudioEffectSupported,
  processAudioEffects,
  resolveAudioEffects,
} from './audioEffects';

const effect = (kind: string, parameters: EffectInstance['parameters']): EffectInstance => ({
  id: `fx-${kind}`,
  kind,
  enabled: true,
  parameters,
});

describe('audio effects', () => {
  it('resolves supported audio effects and evaluates keyframes', () => {
    const effects = resolveAudioEffects([
      effect('gain', {
        gainDb: {
          value: 0,
          keyframes: [
            { id: 'a', time: 0, value: 0, interpolation: 'linear' },
            { id: 'b', time: 2, value: -6, interpolation: 'linear' },
          ],
        },
      }),
      effect('blur', { radius: { value: 4 } }),
    ], 1);
    expect(effects).toHaveLength(1);
    expect(effects[0].kind).toBe('gain');
    if (effects[0].kind === 'gain') expect(effects[0].gain).toBeCloseTo(10 ** (-3 / 20), 6);
  });

  it('applies gain and pan without changing the opposite channel at center', () => {
    const state = createAudioEffectState();
    const effects = resolveAudioEffects([
      effect('gain', { gainDb: { value: -6 } }),
      effect('pan', { pan: { value: 1 } }),
    ], 0);
    const [left, right] = processAudioEffects(1, 1, effects, 48_000, state);
    expect(left).toBeCloseTo(0, 8);
    expect(right).toBeCloseTo(10 ** (-6 / 20), 6);
  });

  it('keeps filter/compressor output finite under extreme samples', () => {
    const state = createAudioEffectState();
    const effects = resolveAudioEffects([
      effect('high-pass', { frequency: { value: 80 } }),
      effect('low-pass', { frequency: { value: 5000 } }),
      effect('compressor', {
        threshold: { value: -24 },
        ratio: { value: 8 },
        attack: { value: 0.003 },
        release: { value: 0.25 },
      }),
    ], 0);
    for (let i = 0; i < 1000; i += 1) {
      const [left, right] = processAudioEffects(i % 2 ? 2 : -2, 1.5, effects, 48_000, state);
      expect(Number.isFinite(left)).toBe(true);
      expect(Number.isFinite(right)).toBe(true);
    }
  });

  it('reports only implemented DSP effects as supported', () => {
    expect(isAudioEffectSupported('gain')).toBe(true);
    expect(isAudioEffectSupported('compressor')).toBe(true);
    expect(isAudioEffectSupported('limiter')).toBe(true);
    expect(isAudioEffectSupported('gate-expander')).toBe(true);
    expect(isAudioEffectSupported('de-esser')).toBe(true);
    expect(isRealtimeAudioEffectSupported('gate-expander')).toBe(true);
    expect(isRealtimeAudioEffectSupported('de-esser')).toBe(true);
    expect(isRealtimeAudioEffectSupported('compressor')).toBe(true);
    expect(isAudioEffectSupported('reverb')).toBe(false);
  });

  it('resolves and applies a stereo-linked peak limiter ceiling', () => {
    const resolved = resolveAudioEffects([
      effect('limiter', { ceiling: { value: -6 } }),
    ], 0);
    expect(resolved).toHaveLength(1);
    expect(resolved[0]).toMatchObject({ kind: 'limiter', ceilingDb: -6 });
    if (resolved[0].kind !== 'limiter') throw new Error('Expected limiter');

    const [left, right] = processAudioEffects(1, 0.5, resolved, 48_000, createAudioEffectState());
    const ceiling = 10 ** (-6 / 20);
    expect(left).toBeCloseTo(ceiling, 8);
    expect(right).toBeCloseTo(ceiling * 0.5, 8);
  });

  it('attenuates signals below gate threshold while preserving loud signals', () => {
    const resolved = resolveAudioEffects([
      effect('gate-expander', {
        threshold: { value: -20 },
        ratio: { value: 2 },
        range: { value: 60 },
        attack: { value: 0 },
        release: { value: 0 },
      }),
    ], 0);
    expect(resolved[0]).toMatchObject({ kind: 'gate-expander', thresholdDb: -20, ratio: 2, rangeDb: 60 });

    const state = createAudioEffectState();
    const [quiet] = processAudioEffects(0.01, 0.01, resolved, 48_000, state);
    expect(Math.abs(quiet)).toBeLessThan(0.002);

    const fresh = createAudioEffectState();
    const [loud] = processAudioEffects(0.5, 0.5, resolved, 48_000, fresh);
    expect(loud).toBeCloseTo(0.5, 8);
  });

  it('caps gate attenuation at the configured range', () => {
    const resolved = resolveAudioEffects([
      effect('gate-expander', {
        threshold: { value: -20 },
        ratio: { value: 20 },
        range: { value: 12 },
        attack: { value: 0 },
        release: { value: 0 },
      }),
    ], 0);
    const [output] = processAudioEffects(0.001, 0.001, resolved, 48_000, createAudioEffectState());
    expect(output).toBeCloseTo(0.001 * 10 ** (-12 / 20), 10);
  });

  it('attenuates high-frequency sibilant energy while preserving steady low-frequency content', () => {
    const resolved = resolveAudioEffects([
      effect('de-esser', {
        frequency: { value: 6000 },
        threshold: { value: -30 },
        ratio: { value: 10 },
        maxReduction: { value: 18 },
        attack: { value: 0 },
        release: { value: 0 },
      }),
    ], 0);
    expect(resolved[0]).toMatchObject({
      kind: 'de-esser',
      frequency: 6000,
      thresholdDb: -30,
      ratio: 10,
      maxReductionDb: 18,
    });

    const highState = createAudioEffectState();
    let high = 0;
    for (let index = 0; index < 256; index += 1) {
      [high] = processAudioEffects(index % 2 === 0 ? 0.8 : -0.8, index % 2 === 0 ? 0.8 : -0.8, resolved, 48_000, highState);
    }
    expect(Math.abs(high)).toBeLessThan(0.5);

    const steadyState = createAudioEffectState();
    let steady = 0;
    for (let index = 0; index < 256; index += 1) {
      [steady] = processAudioEffects(0.8, 0.8, resolved, 48_000, steadyState);
    }
    expect(steady).toBeCloseTo(0.8, 6);
  });

  it('clamps de-esser parameters to safe ranges', () => {
    const resolved = resolveAudioEffects([
      effect('de-esser', {
        frequency: { value: 99_999 },
        threshold: { value: -999 },
        ratio: { value: 999 },
        maxReduction: { value: 999 },
        attack: { value: 9 },
        release: { value: 9 },
      }),
    ], 0);
    expect(resolved[0]).toMatchObject({
      kind: 'de-esser',
      frequency: 14_000,
      thresholdDb: -60,
      ratio: 20,
      maxReductionDb: 30,
      attack: 0.2,
      release: 1,
    });
  });

  it('clamps limiter ceiling to its safe descriptor range', () => {
    const resolved = resolveAudioEffects([
      effect('limiter', { ceiling: { value: 12 } }),
    ], 0);
    expect(resolved[0]).toMatchObject({ kind: 'limiter', ceilingDb: 0, ceiling: 1 });
  });
});
