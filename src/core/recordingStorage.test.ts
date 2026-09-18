import { describe, expect, it } from 'vitest';
import { sanitizeRecordingFileName } from './recordingStorage';

describe('recording storage helpers', () => {
  it('sanitizes temporary recording names without path separators', () => {
    expect(sanitizeRecordingFileName(' screen / tab 2026:09:19.webm ')).toBe('screen_tab_2026_09_19.webm');
  });

  it('falls back to a valid filename and bounds length', () => {
    expect(sanitizeRecordingFileName('////')).toBe('recording.webm');
    expect(sanitizeRecordingFileName('a'.repeat(400)).length).toBe(180);
  });
});
