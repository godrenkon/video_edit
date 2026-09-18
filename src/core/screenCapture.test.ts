import { describe, expect, it } from 'vitest';
import { preferredScreenCaptureMimeType, screenCaptureFileName } from './screenCapture';

describe('screen capture helpers', () => {
  it('prefers VP9 with Opus and falls back to VP8/WebM', () => {
    expect(preferredScreenCaptureMimeType((mime) => mime === 'video/webm;codecs=vp9,opus'))
      .toBe('video/webm;codecs=vp9,opus');
    expect(preferredScreenCaptureMimeType((mime) => mime === 'video/webm;codecs=vp8,opus'))
      .toBe('video/webm;codecs=vp8,opus');
    expect(preferredScreenCaptureMimeType((mime) => mime === 'video/webm'))
      .toBe('video/webm');
  });

  it('returns empty when no declared capture type is supported', () => {
    expect(preferredScreenCaptureMimeType(() => false)).toBe('');
  });

  it('creates a filesystem-safe WebM name', () => {
    expect(screenCaptureFileName(new Date('2026-09-19T00:01:02.345Z')))
      .toBe('screen-2026-09-19T00-01-02-345Z.webm');
  });
});
