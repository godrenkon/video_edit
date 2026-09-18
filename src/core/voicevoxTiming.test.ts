import { describe, expect, it } from 'vitest';
import {
  mapVoicevoxVowel,
  parseVoicevoxAudioQueryMouthCues,
  voicevoxFrames,
} from './voicevoxTiming';

describe('VOICEVOX timing import', () => {
  it('maps voiced and devoiced vowels to five mouth shapes', () => {
    expect(mapVoicevoxVowel('a')).toBe('a');
    expect(mapVoicevoxVowel('I')).toBe('i');
    expect(mapVoicevoxVowel('U')).toBe('u');
    expect(mapVoicevoxVowel('pau')).toBeUndefined();
    expect(mapVoicevoxVowel('N')).toBeUndefined();
  });

  it('uses VOICEVOX 93.75fps half-even frame rounding', () => {
    expect(voicevoxFrames(8.5 / 93.75)).toBe(8);
    expect(voicevoxFrames(9.5 / 93.75)).toBe(10);
    expect(voicevoxFrames(1 / 93.75)).toBe(1);
  });

  it('applies pause overrides and speedScale before frame quantization', () => {
    const result = parseVoicevoxAudioQueryMouthCues({
      accent_phrases: [{
        moras: [{
          text: 'カ',
          consonant: 'k',
          consonant_length: 0.08,
          vowel: 'a',
          vowel_length: 0.16,
          pitch: 5,
        }],
        accent: 1,
        pause_mora: {
          text: '、',
          consonant: null,
          consonant_length: null,
          vowel: 'pau',
          vowel_length: 0.4,
          pitch: 0,
        },
        is_interrogative: false,
      }],
      speedScale: 2,
      prePhonemeLength: 0.1,
      postPhonemeLength: 0.1,
      pauseLength: 0.2,
      pauseLengthScale: 0.5,
    });

    const expectedFrames =
      voicevoxFrames(0.1 / 2)
      + voicevoxFrames(0.08 / 2)
      + voicevoxFrames(0.16 / 2)
      + voicevoxFrames((0.2 * 0.5) / 2)
      + voicevoxFrames(0.1 / 2);
    expect(result.estimatedDuration).toBeCloseTo(expectedFrames / 93.75, 10);
    expect(result.speedScale).toBe(2);
    expect(result.moraCount).toBe(1);
    expect(result.cues.some((cue) => cue.vowel === 'a' && cue.state === 2)).toBe(true);
  });

  it('adds the current VOICEVOX interrogative upspeak mora by default', () => {
    const query = {
      accent_phrases: [{
        moras: [{
          text: 'ノ',
          consonant: 'n',
          consonant_length: 0.04,
          vowel: 'o',
          vowel_length: 0.08,
          pitch: 5,
        }],
        accent: 1,
        pause_mora: null,
        is_interrogative: true,
      }],
      speedScale: 1,
      prePhonemeLength: 0,
      postPhonemeLength: 0,
    };

    const enabled = parseVoicevoxAudioQueryMouthCues(query);
    const disabled = parseVoicevoxAudioQueryMouthCues(query, { enableInterrogativeUpspeak: false });

    expect(enabled.estimatedDuration - disabled.estimatedDuration)
      .toBeCloseTo(voicevoxFrames(0.15) / 93.75, 10);
    expect(enabled.cues.some((cue) => cue.vowel === 'o' && cue.state === 2)).toBe(true);
    expect(enabled.cues.at(-1)?.state).toBe(0);
    expect(enabled.cues.at(-1)?.time).toBeCloseTo(enabled.estimatedDuration, 10);
    expect(enabled.cues.at(-1)?.time).toBeGreaterThan(disabled.cues.at(-1)?.time ?? 0);
  });

  it('accepts snake_case compatible query fields', () => {
    const result = parseVoicevoxAudioQueryMouthCues(JSON.stringify({
      accent_phrases: [{
        moras: [{
          text: 'ア',
          consonant: null,
          consonant_length: null,
          vowel: 'a',
          vowel_length: 0.1,
          pitch: 5,
        }],
        is_interrogative: false,
      }],
      speed_scale: 1,
      pre_phoneme_length: 0,
      post_phoneme_length: 0,
    }));
    expect(result.cues.some((cue) => cue.vowel === 'a')).toBe(true);
  });

  it('rejects malformed AudioQuery input clearly', () => {
    expect(() => parseVoicevoxAudioQueryMouthCues('{broken')).toThrow(/could not be parsed/);
    expect(() => parseVoicevoxAudioQueryMouthCues({})).toThrow(/accent_phrases/);
  });
});
