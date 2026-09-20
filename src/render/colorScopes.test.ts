import { describe, expect, it } from 'vitest';
import { analyzeColorScopes, histogramPeak } from './colorScopes';

function image(values: number[], width: number, height: number) {
  return {
    data: new Uint8ClampedArray(values),
    width,
    height,
    colorSpace: 'srgb',
  } as ImageData;
}

describe('color scopes analysis', () => {
  it('builds per-channel histograms and normalized points', () => {
    const data = analyzeColorScopes(image([
      255, 0, 0, 255,
      0, 255, 0, 255,
      0, 0, 255, 255,
      255, 255, 255, 255,
    ], 2, 2), 100);

    expect(data.sampleCount).toBe(4);
    expect(data.histogramR[255]).toBe(2);
    expect(data.histogramG[255]).toBe(2);
    expect(data.histogramB[255]).toBe(2);
    expect(data.waveform.length).toBe(8);
    expect(data.vectorscope.length).toBe(8);
    expect(histogramPeak(data)).toBe(2);
  });

  it('ignores fully transparent pixels', () => {
    const data = analyzeColorScopes(image([
      255, 255, 255, 0,
      10, 20, 30, 255,
    ], 2, 1));
    expect(data.sampleCount).toBe(1);
    expect(data.histogramR[255]).toBe(0);
    expect(data.histogramR[10]).toBe(1);
  });

  it('bounds sample count for large frames', () => {
    const pixels = 10000;
    const raw = new Uint8ClampedArray(pixels * 4);
    for (let i = 0; i < raw.length; i += 4) raw.set([100, 120, 140, 255], i);
    const data = analyzeColorScopes({ data: raw, width: 100, height: 100, colorSpace: 'srgb' } as ImageData, 1000);
    expect(data.sampleCount).toBeLessThanOrEqual(1000);
  });
});
