import { describe, expect, it } from 'vitest';
import { cameraCaptureFileName, extensionForVideoRecordingMime, preferredScreenCaptureMimeType, screenCaptureFileName } from './screenCapture';

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

  it('creates filesystem-safe capture names with matching extensions', () => {
    const now = new Date('2026-09-19T00:01:02.345Z');
    expect(screenCaptureFileName(now)).toBe('screen-2026-09-19T00-01-02-345Z.webm');
    expect(extensionForVideoRecordingMime('video/mp4')).toBe('mp4');
    expect(extensionForVideoRecordingMime('video/webm;codecs=vp9')).toBe('webm');
    expect(cameraCaptureFileName(now, 'video/mp4')).toBe('camera-2026-09-19T00-01-02-345Z.mp4');
  });
});
