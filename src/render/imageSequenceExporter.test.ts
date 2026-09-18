import { describe, expect, it } from 'vitest';
import { pngSequenceFileName, pngSequenceFrameRange } from './imageSequenceExporter';

describe('PNG image sequence planning', () => {
  it('uses the project frame grid for an arbitrary in/out range', () => {
    expect(pngSequenceFrameRange(30, 1.01, 1.11)).toEqual({
      fps: 30,
      firstFrame: 31,
      endFrameExclusive: 34,
      totalFrames: 3,
    });
  });

  it('keeps exact frame boundaries stable', () => {
    expect(pngSequenceFrameRange(60, 2, 2.05)).toEqual({
      fps: 60,
      firstFrame: 120,
      endFrameExclusive: 123,
      totalFrames: 3,
    });
  });

  it('creates sortable fixed-width PNG names', () => {
    expect(pngSequenceFileName('Shot', 1, 120)).toBe('Shot-000001.png');
    expect(pngSequenceFileName('Shot', 120, 120)).toBe('Shot-000120.png');
  });

  it('sanitizes unsafe sequence prefixes', () => {
    expect(pngSequenceFileName('../bad/name', 1, 2)).toBe('..-bad-name-000001.png');
  });
});
