import { describe, expect, it } from 'vitest';
import { amplitudeToDb, measureAudioSamples } from './audioMeter';

describe('audio meter math', () => {
  it('measures peak and RMS from finite samples', () => {
    const reading = measureAudioSamples(new Float32Array([1, -1, 0, 0]));
    expect(reading.peak).toBe(1);
    expect(reading.rms).toBeCloseTo(Math.sqrt(0.5), 8);
    expect(reading.peakDb).toBeCloseTo(0, 8);
    expect(reading.rmsDb).toBeCloseTo(-3.0103, 3);
  });

  it('uses a bounded silence floor and ignores non-finite values', () => {
    expect(amplitudeToDb(0)).toBe(-120);
    expect(measureAudioSamples([Number.NaN, Number.POSITIVE_INFINITY]).rmsDb).toBe(-120);
  });
});
