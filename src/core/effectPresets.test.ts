import { describe, expect, it } from 'vitest';
import type { EffectInstance } from '../types/editor';
import {
  createEffectPreset,
  instantiatePresetEffects,
  normalizePresetName,
  parseEffectPresets,
  serializeEffectPresets,
} from './effectPresets';

function effects(): EffectInstance[] {
  return [{
    id: 'fx-source',
    kind: 'brightness-contrast',
    enabled: true,
    parameters: {
      brightness: {
        value: 0.2,
        keyframes: [{
          id: 'kf-source',
          time: 1,
          value: 0.5,
          interpolation: 'bezier',
          inTangent: [0, 0],
          outTangent: [1, 1],
        }],
      },
    },
  }];
}

describe('effect presets', () => {
  it('normalizes preset names and snapshots effect data', () => {
    const source = effects();
    const preset = createEffectPreset('  My   Look  ', source, new Date('2026-01-01T00:00:00.000Z'));
    expect(preset.name).toBe('My Look');
    expect(preset.createdAt).toBe('2026-01-01T00:00:00.000Z');
    source[0].parameters.brightness.value = 99;
    expect(preset.effects[0].parameters.brightness.value).toBe(0.2);
  });

  it('instantiates fresh effect and keyframe identities on every apply', () => {
    const preset = createEffectPreset('Look', effects());
    const first = instantiatePresetEffects(preset);
    const second = instantiatePresetEffects(preset);
    expect(first[0].id).not.toBe(preset.effects[0].id);
    expect(first[0].id).not.toBe(second[0].id);
    expect(first[0].parameters.brightness.keyframes?.[0].id).not.toBe(
      second[0].parameters.brightness.keyframes?.[0].id,
    );
  });

  it('round-trips valid presets and rejects malformed entries', () => {
    const preset = createEffectPreset('Look', effects(), new Date('2026-01-01T00:00:00.000Z'));
    const parsed = parseEffectPresets(serializeEffectPresets([preset]));
    expect(parsed).toHaveLength(1);
    expect(parsed[0]).toMatchObject({ id: preset.id, name: 'Look' });
    expect(parseEffectPresets('{broken')).toEqual([]);
    expect(parseEffectPresets(JSON.stringify([{ id: 'x', name: '', effects: [] }]))).toEqual([]);
  });

  it('limits normalized names to a compact single line', () => {
    expect(normalizePresetName('  a\n\t b  ')).toBe('a b');
    expect(normalizePresetName('x'.repeat(200))).toHaveLength(80);
  });
});
