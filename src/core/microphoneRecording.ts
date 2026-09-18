export const MAX_MIC_RECORDING_MS = 30 * 60 * 1000;

export const AUDIO_RECORDING_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
] as const;

export function preferredAudioRecordingMimeType(isSupported: (mime: string) => boolean) {
  return AUDIO_RECORDING_MIME_CANDIDATES.find((mime) => {
    try {
      return isSupported(mime);
    } catch {
      return false;
    }
  }) ?? '';
}

export function extensionForAudioRecordingMime(mime: string) {
  const normalized = mime.toLowerCase();
  if (normalized.includes('ogg')) return 'ogg';
  if (normalized.includes('mp4') || normalized.includes('m4a')) return 'm4a';
  return 'webm';
}

export function microphoneRecordingFileName(now: Date, mime: string) {
  const iso = now.toISOString().replace(/[:.]/g, '-');
  return `mic-${iso}.${extensionForAudioRecordingMime(mime)}`;
}

export function formatRecordingElapsed(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
