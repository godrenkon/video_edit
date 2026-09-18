import { describe, expect, it } from 'vitest';
import { amplitudeToDb, loudnessAnalyserFftSize, loudnessFromMeanSquare, measureAudioSamples, measureKWeightedLoudness } from './audioMeter';

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

  it('converts K-weighted energy to BS.1770-style momentary loudness', () => {
    expect(loudnessFromMeanSquare(1)).toBeCloseTo(-0.691, 6);
    expect(measureKWeightedLoudness(new Float32Array(100).fill(0.1))).toBeCloseTo(-20.691, 3);
    expect(measureKWeightedLoudness([])).toBe(-120);
  });

  it('chooses a bounded power-of-two analyser window below 400 ms', () => {
    expect(loudnessAnalyserFftSize(48_000)).toBe(16_384);
    expect(loudnessAnalyserFftSize(44_100)).toBe(16_384);
    expect(loudnessAnalyserFftSize(8_000)).toBe(2_048);
    expect(Math.log2(loudnessAnalyserFftSize(96_000)) % 1).toBe(0);
  });
});
