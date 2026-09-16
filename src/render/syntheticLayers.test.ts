import { describe, expect, it } from 'vitest';
import type { GeneratorPayload, TextPayload } from '../types/editor';
import {
  deterministicNoiseByte,
  generatorColor,
  generatorNumber,
  hashString,
  resolveTextStyle,
  wrapTextLines,
} from './syntheticLayers';

describe('synthetic render helpers', () => {
  it('resolves readable subtitle defaults without overriding explicit text styling', () => {
    expect(resolveTextStyle(null, 'hello')).toMatchObject({
      text: 'hello',
      fontSize: 54,
      fontWeight: 700,
      color: '#ffffff',
      strokeColor: '#000000',
      strokeWidth: 5,
      align: 'center',
    });

    const text: TextPayload = {
      text: 'Title',
      fontFamily: 'Noto Sans JP',
      fontSize: 90,
      fontWeight: 900,
      color: '#00ff00',
      strokeWidth: 3,
      align: 'left',
    };
    expect(resolveTextStyle(text)).toMatchObject({ text: 'Title', fontSize: 90, fontWeight: 900, color: '#00ff00', strokeWidth: 3, align: 'left' });
  });

  it('wraps Japanese text deterministically using character boundaries', () => {
    const lines = wrapTextLines('あいうえお', 3, (value) => value.length);
    expect(lines).toEqual(['あいう', 'えお']);
  });

  it('preserves explicit line breaks', () => {
    expect(wrapTextLines('one\ntwo', 100, (value) => value.length)).toEqual(['one', 'two']);
  });

  it('reads generator values with safe fallbacks and bounds', () => {
    const generator: GeneratorPayload = {
      kind: 'gradient',
      data: { startColor: '#123456', angle: 999 },
    };
    expect(generatorColor(generator, 'startColor', '#000')).toBe('#123456');
    expect(generatorColor(generator, 'missing', '#000')).toBe('#000');
    expect(generatorNumber(generator, 'angle', 0, -360, 360)).toBe(360);
  });

  it('produces stable deterministic noise bytes', () => {
    const seed = hashString('clip:1000');
    expect(hashString('clip:1000')).toBe(seed);
    expect(deterministicNoiseByte(seed, 3, 7)).toBe(deterministicNoiseByte(seed, 3, 7));
    expect(deterministicNoiseByte(seed, 3, 7)).not.toBe(deterministicNoiseByte(seed, 4, 7));
  });
});
