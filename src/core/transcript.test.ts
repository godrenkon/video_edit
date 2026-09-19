import { describe, expect, it } from 'vitest';
import type { Project, TranscriptDocument } from '../types/editor';
import {
  buildTranscriptFromSubtitleTracks,
  removeTranscriptSegment,
  sanitizeTranscriptDocument,
  searchTranscript,
  transcriptPlainText,
  updateTranscriptSegment,
} from './transcript';

function project(): Project {
  return {
    version: 2,
    id: 'p',
    name: 'Transcript',
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#000000',
    duration: 20,
    createdAt: '',
    updatedAt: '',
    assets: [],
    tracks: [{
      id: 'sub',
      name: '字幕',
      kind: 'subtitle',
      muted: false,
      locked: false,
      visible: true,
      clips: [{
        id: 'clip-a',
        kind: 'subtitle',
        name: '字幕1',
        start: 5,
        duration: 2,
        inPoint: 0,
        volume: 1,
        muted: false,
        transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
        subtitle: {
          text: 'こんにちは 世界',
          speaker: 'ずんだもん',
          words: [
            { text: 'こんにちは', start: 0, end: 0.8 },
            { text: '世界', start: 0.9, end: 1.3 },
          ],
        },
      }, {
        id: 'clip-b',
        kind: 'subtitle',
        name: '字幕2',
        start: 2,
        duration: 1.5,
        inPoint: 0,
        volume: 1,
        muted: false,
        transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
        subtitle: { text: '最初の説明', speaker: '四国めたん' },
      }],
    }],
  };
}

describe('transcript document', () => {
  it('builds sorted absolute-time segments from subtitle tracks', () => {
    const transcript = buildTranscriptFromSubtitleTracks(project(), new Date('2026-01-01T00:00:00.000Z'));
    expect(transcript.source).toBe('subtitle');
    expect(transcript.updatedAt).toBe('2026-01-01T00:00:00.000Z');
    expect(transcript.segments.map((segment) => segment.sourceClipId)).toEqual(['clip-b', 'clip-a']);
    expect(transcript.segments[1]).toMatchObject({
      start: 5,
      end: 7,
      text: 'こんにちは 世界',
      speaker: 'ずんだもん',
    });
    expect(transcript.segments[1].words).toEqual([
      { text: 'こんにちは', start: 5, end: 5.8, confidence: undefined },
      { text: '世界', start: 5.9, end: 6.3, confidence: undefined },
    ]);
  });

  it('searches transcript text, speaker and timed words', () => {
    const transcript = buildTranscriptFromSubtitleTracks(project());
    expect(searchTranscript(transcript, '世界')[0]).toMatchObject({ start: 5, speaker: 'ずんだもん' });
    expect(searchTranscript(transcript, '四国めたん')[0]).toMatchObject({ start: 2, text: '最初の説明' });
    expect(searchTranscript(transcript, '存在しない')).toEqual([]);
  });

  it('updates and removes individual transcript segments without mutating other entries', () => {
    const transcript = buildTranscriptFromSubtitleTracks(project());
    const target = transcript.segments[0];
    const updated = updateTranscriptSegment(transcript, target.id, {
      text: '更新した説明',
      speaker: 'ナレーター',
      start: 1,
      end: 4,
    }, new Date('2026-02-01T00:00:00.000Z'));
    expect(updated.updatedAt).toBe('2026-02-01T00:00:00.000Z');
    expect(updated.segments[0]).toMatchObject({ text: '更新した説明', speaker: 'ナレーター', start: 1, end: 4 });
    expect(removeTranscriptSegment(updated, target.id).segments).toHaveLength(1);
  });

  it('sanitizes malformed persisted transcript data', () => {
    const transcript = sanitizeTranscriptDocument({
      id: 't',
      source: 'stt',
      language: ' ja-JP ',
      updatedAt: 'x',
      segments: [
        { id: 'ok', start: -2, end: 4, text: ' hello ', speaker: ' voice ', words: [
          { text: 'hi', start: -3, end: 99, confidence: 4 },
        ] },
        { id: 'bad', start: 5, end: 5, text: 'ignored' },
      ],
    });
    expect(transcript).toMatchObject({
      id: 't',
      source: 'stt',
      language: 'ja-JP',
      segments: [{
        id: 'ok',
        start: 0,
        end: 4,
        text: 'hello',
        speaker: 'voice',
      }],
    });
    expect(transcript?.segments[0].words).toEqual([{ text: 'hi', start: 0, end: 4, confidence: 1 }]);
  });

  it('creates readable plain text with optional speaker prefixes', () => {
    const transcript: TranscriptDocument = {
      id: 't',
      source: 'manual',
      updatedAt: '',
      segments: [
        { id: '1', start: 0, end: 1, text: 'Hello', speaker: 'A' },
        { id: '2', start: 1, end: 2, text: 'World' },
      ],
    };
    expect(transcriptPlainText(transcript)).toBe('A: Hello\nWorld');
  });
});
