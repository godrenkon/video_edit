import { describe, expect, it } from 'vitest';
import { formatSrt, formatSrtTimestamp, parseSrt, stripSrtMarkup, subtitleClipsFromSrt, subtitleClipsToSrt } from './subtitles';

describe('SRT subtitle exchange', () => {
  it('parses BOM, CRLF, numeric indexes and multiline text', () => {
    const input = '\uFEFF1\r\n00:00:01,250 --> 00:00:03,500\r\n一行目\r\n二行目\r\n\r\n2\r\n00:00:05,000 --> 00:00:06,100\r\n次の字幕\r\n';
    expect(parseSrt(input)).toEqual([
      { start: 1.25, end: 3.5, text: '一行目\n二行目' },
      { start: 5, end: 6.1, text: '次の字幕' },
    ]);
  });

  it('accepts dot fractions and timing lines without numeric indexes', () => {
    expect(parseSrt('00:00:00.500 --> 00:00:01.250\nHello')).toEqual([
      { start: 0.5, end: 1.25, text: 'Hello' },
    ]);
  });

  it('ignores malformed and zero-length cues instead of corrupting the timeline', () => {
    const input = [
      '1\nnot a timestamp\nBad',
      '2\n00:00:03,000 --> 00:00:03,000\nZero',
      '3\n00:99:00,000 --> 00:99:01,000\nInvalid minutes',
      '4\n00:00:04,000 --> 00:00:05,000\nGood',
    ].join('\n\n');
    expect(parseSrt(input)).toEqual([{ start: 4, end: 5, text: 'Good' }]);
  });

  it('formats sorted cues with canonical comma millisecond timestamps', () => {
    const output = formatSrt([
      { start: 5.1, end: 6.25, text: 'B' },
      { start: 1.2344, end: 2.9996, text: 'A\nA2' },
    ]);
    expect(output).toBe(
      '1\n00:00:01,234 --> 00:00:03,000\nA\nA2\n\n' +
      '2\n00:00:05,100 --> 00:00:06,250\nB\n',
    );
  });

  it('supports hour values beyond two digits without truncation', () => {
    expect(formatSrtTimestamp(100 * 3600 + 2.345)).toBe('100:00:02,345');
  });

  it('converts SRT cues to subtitle clips with offset and plain-text markup', () => {
    const clips = subtitleClipsFromSrt(
      '1\n00:00:01,000 --> 00:00:02,500\n<i>Hello</i> {\\an8}world',
      { offsetSeconds: 10, y: 300 },
    );
    expect(clips).toHaveLength(1);
    expect(clips[0]).toMatchObject({
      kind: 'subtitle',
      start: 11,
      duration: 1.5,
      transform: { y: 300 },
      subtitle: { text: 'Hello world' },
    });
  });

  it('exports subtitle clips by absolute timeline position', () => {
    const clips = subtitleClipsFromSrt(
      '1\n00:00:02,000 --> 00:00:03,000\nFirst\n\n2\n00:00:05,000 --> 00:00:06,500\nSecond',
      { y: 100 },
    );
    clips[0].start = 7;
    expect(subtitleClipsToSrt(clips)).toContain('00:00:07,000 --> 00:00:08,000');
    expect(subtitleClipsToSrt(clips)).toContain('00:00:05,000 --> 00:00:06,500');
  });

  it('strips supported SRT and SSA-style presentation markup for plain subtitle clips', () => {
    expect(stripSrtMarkup('<b><font color="#fff">Text</font></b> {\\an8}')).toBe('Text');
  });
});
