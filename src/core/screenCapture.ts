export const SCREEN_CAPTURE_MIME_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const;

export function preferredScreenCaptureMimeType(isSupported: (mime: string) => boolean) {
  return SCREEN_CAPTURE_MIME_CANDIDATES.find((mime) => {
    try {
      return isSupported(mime);
    } catch {
      return false;
    }
  }) ?? '';
}

export function screenCaptureFileName(now: Date) {
  return `screen-${now.toISOString().replace(/[:.]/g, '-')}.webm`;
}
