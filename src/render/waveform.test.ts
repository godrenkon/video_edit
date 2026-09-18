import { describe, expect, it } from 'vitest';
import { accumulateWaveformPeaks, parseWaveformCache, waveformBinCount, waveformFingerprint } from './waveform';
import type { AssetMeta } from '../types/editor';

const asset: AssetMeta = {
  id: 'asset',
  name: 'voice.wav',
  kind: 'audio',
  mime: 'audio/wav',
  size: 1234,
  duration: 2,
  storageName: 'asset.wav',
};

describe('waveform planning', () => {
  it('bounds waveform resolution for long media', () => {
    expect(waveformBinCount(2, 10, 100)).toBe(20);
    expect(waveformBinCount(10_000, 48, 12_000)).toBe(12_000);
    expect(waveformBinCount(0, 48, 12_000)).toBe(0);
  });

  it('builds a stable fingerprint and prefers a content hash', () => {
    expect(waveformFingerprint(asset)).toBe('asset.wav:1234:2');
    expect(waveformFingerprint({ ...asset, hash: 'abc' })).toBe('abc');
  });

  it('accumulates the strongest absolute channel sample into each time bin', () => {
    const peaks = new Float32Array(4);
    accumulateWaveformPeaks(
      peaks,
      2,
      [new Float32Array([0.1, -0.7, 0.2, 0.1]), new Float32Array([0.3, 0.2, -0.9, 0.1])],
      2,
      0,
      0,
      2,
    );
    expect(Array.from(peaks)).toEqual([0.30000001192092896, 0.699999988079071, 0.8999999761581421, 0.10000000149011612]);
  });

  it('honors chunk boundaries so overlapping decoded buffers are not counted twice', () => {
    const peaks = new Float32Array(4);
    accumulateWaveformPeaks(peaks, 2, [new Float32Array([1, 1, 1, 1])], 2, 0, 1, 2);
    expect(Array.from(peaks)).toEqual([0, 0, 1, 1]);
  });

  it('accepts only cache payloads matching media fingerprint and analysis settings', () => {
    const data = {
      version: 1,
      fingerprint: 'fp',
      duration: 2,
      samplesPerSecond: 10,
      peaks: Array.from({ length: 20 }, () => 0.5),
    };
    expect(parseWaveformCache(JSON.stringify(data), 'fp', 2, 10, 100)?.peaks).toHaveLength(20);
    expect(parseWaveformCache(JSON.stringify(data), 'other', 2, 10, 100)).toBeNull();
    expect(parseWaveformCache(JSON.stringify({ ...data, peaks: [2] }), 'fp', 2, 10, 100)).toBeNull();
  });
});
