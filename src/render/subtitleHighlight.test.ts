import { describe, expect, it } from 'vitest';
import {
  activeSubtitleHighlight,
  generateEvenSubtitleWords,
  normalizeSubtitleHighlightColor,
  subtitleWordRanges,
} from './subtitleHighlight';

describe('subtitle word highlight', () => {
  it('aligns timed words to exact character ranges in subtitle text', () => {
    const ranges = subtitleWordRanges({
      text: 'hello, world!',
      words: [
        { text: 'hello', start: 0, end: 1 },
        { text: 'world', start: 1, end: 2 },
      ],
    });
    expect(ranges).toEqual([
      { wordIndex: 0, text: 'hello', charStart: 0, charEnd: 5, start: 0, end: 1 },
      { wordIndex: 1, text: 'world', charStart: 7, charEnd: 12, start: 1, end: 2 },
    ]);
  });

  it('selects the active timed word only when highlighting is enabled', () => {
    const subtitle = {
      text: 'one two',
      wordHighlight: true,
      words: [
        { text: 'one', start: 0, end: 0.5 },
        { text: 'two', start: 0.5, end: 1 },
      ],
    };
    expect(activeSubtitleHighlight(subtitle, 0.75)?.text).toBe('two');
    expect(activeSubtitleHighlight({ ...subtitle, wordHighlight: false }, 0.75)).toBeNull();
  });

  it('generates deterministic even timings by word for spaced text', () => {
    expect(generateEvenSubtitleWords('one two three', 3)).toEqual([
      { text: 'one', start: 0, end: 1 },
      { text: 'two', start: 1, end: 2 },
      { text: 'three', start: 2, end: 3 },
    ]);
  });

  it('falls back to character timing for unspaced Japanese text', () => {
    expect(generateEvenSubtitleWords('字幕', 2)).toEqual([
      { text: '字', start: 0, end: 1 },
      { text: '幕', start: 1, end: 2 },
    ]);
  });

  it('normalizes invalid highlight colors', () => {
    expect(normalizeSubtitleHighlightColor('#12abEF')).toBe('#12abEF');
    expect(normalizeSubtitleHighlightColor('orange')).toBe('#ffc928');
  });
});
