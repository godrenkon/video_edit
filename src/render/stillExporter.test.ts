import { describe, expect, it } from 'vitest';
import { clampStillTime, formatFrameStamp } from './stillExporter';

describe('PNG still export helpers', () => {
  it('clamps requested frame time to the project duration', () => {
    expect(clampStillTime({ duration: 12 }, -3)).toBe(0);
    expect(clampStillTime({ duration: 12 }, 4.25)).toBe(4.25);
    expect(clampStillTime({ duration: 12 }, 99)).toBe(12);
    expect(clampStillTime({ duration: 12 }, Number.NaN)).toBe(0);
  });

  it('formats stable millisecond frame stamps for filenames', () => {
    expect(formatFrameStamp(0)).toBe('00-00-00-000');
    expect(formatFrameStamp(61.234)).toBe('00-01-01-234');
    expect(formatFrameStamp(3_661.999)).toBe('01-01-01-999');
  });
});
