import { describe, expect, it } from 'vitest';
import { createVoicePresetEffects, VOICE_PRESETS } from './voicePresets';

describe('VOICEVOX audio presets', () => {
  it('defines three reusable preset choices', () => {
    expect(VOICE_PRESETS.map((preset) => preset.id)).toEqual([
      'voicevox-balanced',
      'voicevox-clear',
      'voicevox-soft',
    ]);
  });

  it('creates fresh effect identities for every apply', () => {
    const first = createVoicePresetEffects('voicevox-balanced');
    const second = createVoicePresetEffects('voicevox-balanced');
    expect(first.map((effect) => effect.id)).not.toEqual(second.map((effect) => effect.id));
  });

  it('uses only realtime-supported core audio effects', () => {
    const effects = createVoicePresetEffects('voicevox-clear');
    expect(effects.map((effect) => effect.kind)).toEqual([
      'high-pass',
      'low-pass',
      'compressor',
      'limiter',
    ]);
    expect(effects.find((effect) => effect.kind === 'high-pass')?.parameters.frequency.value).toBe(100);
    expect(effects.find((effect) => effect.kind === 'compressor')?.parameters.threshold.value).toBe(-20);
    expect(effects.find((effect) => effect.kind === 'limiter')?.parameters.ceiling.value).toBe(-1);
  });

  it('keeps the soft preset less aggressive than the clear preset', () => {
    const soft = createVoicePresetEffects('voicevox-soft').find((effect) => effect.kind === 'compressor');
    const clear = createVoicePresetEffects('voicevox-clear').find((effect) => effect.kind === 'compressor');
    expect(Number(soft?.parameters.ratio.value)).toBeLessThan(Number(clear?.parameters.ratio.value));
  });
});
