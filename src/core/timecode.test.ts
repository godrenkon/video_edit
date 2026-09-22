import { describe, expect, it } from 'vitest';
import {
  formatEditorTimecode,
  formatSmpteTimecode,
  parseSmpteTimecode,
  resolveFrameRateSpec,
  supportsDropFrameTimecode,
} from './timecode';

describe('SMPTE timecode', () => {
  it('recognizes canonical NTSC fractional rates without treating integer rates as drop-frame', () => {
    expect(resolveFrameRateSpec(23.976)).toMatchObject({ nominal: 24, numerator: 24000, denominator: 1001, dropFrames: 0 });
    expect(resolveFrameRateSpec(29.97)).toMatchObject({ nominal: 30, numerator: 30000, denominator: 1001, dropFrames: 2 });
    expect(resolveFrameRateSpec(59.94)).toMatchObject({ nominal: 60, numerator: 60000, denominator: 1001, dropFrames: 4 });
    expect(supportsDropFrameTimecode(30)).toBe(false);
    expect(supportsDropFrameTimecode(29.97)).toBe(true);
  });

  it('formats ordinary non-drop timecode by sequence frame', () => {
    expect(formatSmpteTimecode(0, 24)).toBe('00:00:00:00');
    expect(formatSmpteTimecode(1, 24)).toBe('00:00:01:00');
    expect(formatSmpteTimecode(3661 + 12 / 24, 24)).toBe('01:01:01:12');
  });

  it('skips dropped frame numbers at NTSC minute boundaries', () => {
    const rate = 30000 / 1001;
    expect(formatSmpteTimecode(1800 / rate, rate, true)).toBe('00:01:00;02');
    expect(formatSmpteTimecode(17982 / rate, rate, true)).toBe('00:10:00;00');
    expect(formatSmpteTimecode(107892 / rate, rate, true)).toBe('01:00:00;00');
  });

  it('supports explicit DF and NDF sequence display modes', () => {
    const rate2997 = 30000 / 1001;
    const rate5994 = 60000 / 1001;
    expect(formatEditorTimecode(1800 / rate2997, rate2997, 'drop-frame')).toBe('00:01:00;02');
    expect(formatEditorTimecode(1800 / rate2997, rate2997, 'non-drop-frame')).toBe('00:01:00:00');
    expect(formatEditorTimecode(3600 / rate5994, rate5994, 'drop-frame')).toBe('00:01:00;04');
    expect(formatEditorTimecode(1800 / rate2997, rate2997)).toBe('00:01:00;02');
  });

  it('parses valid timecode and rejects frame numbers that do not exist in drop-frame notation', () => {
    const rate = 30000 / 1001;
    expect(parseSmpteTimecode('00:01:00;00', rate)).toBeNull();
    expect(parseSmpteTimecode('00:01:00;01', rate)).toBeNull();
    expect(parseSmpteTimecode('00:01:00;02', rate)).toBeCloseTo(1800 / rate, 10);
    expect(parseSmpteTimecode('00:10:00;00', rate)).toBeCloseTo(17982 / rate, 10);
    expect(parseSmpteTimecode('00:00:00;00', 24)).toBeNull();
  });
});
