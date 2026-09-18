import { describe, expect, it } from 'vitest';
import {
  extensionForAudioRecordingMime,
  formatRecordingElapsed,
  microphoneRecordingFileName,
  preferredAudioRecordingMimeType,
} from './microphoneRecording';

describe('microphone recording helpers', () => {
  it('prefers Opus WebM when available and falls back safely', () => {
    expect(preferredAudioRecordingMimeType((mime) => mime === 'audio/webm;codecs=opus'))
      .toBe('audio/webm;codecs=opus');
    expect(preferredAudioRecordingMimeType((mime) => mime === 'audio/ogg'))
      .toBe('audio/ogg');
    expect(preferredAudioRecordingMimeType(() => false)).toBe('');
  });

  it('maps common recording MIME types to safe extensions', () => {
    expect(extensionForAudioRecordingMime('audio/webm;codecs=opus')).toBe('webm');
    expect(extensionForAudioRecordingMime('audio/ogg;codecs=opus')).toBe('ogg');
    expect(extensionForAudioRecordingMime('audio/mp4')).toBe('m4a');
  });

  it('creates filesystem-safe recording names', () => {
    expect(microphoneRecordingFileName(new Date('2026-09-19T00:00:01.234Z'), 'audio/webm'))
      .toBe('mic-2026-09-19T00-00-01-234Z.webm');
  });

  it('formats elapsed recording time', () => {
    expect(formatRecordingElapsed(0)).toBe('00:00');
    expect(formatRecordingElapsed(65_999)).toBe('01:05');
  });
});
