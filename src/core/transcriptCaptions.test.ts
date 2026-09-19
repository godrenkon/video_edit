import { describe, expect, it } from 'vitest';
import type { Project, TranscriptDocument } from '../types/editor';
import { applyTranscriptAsSubtitles, TRANSCRIPT_SUBTITLE_TRACK_NAME, transcriptSegmentToSubtitleClip } from './transcriptCaptions';

function project(): Project {
  return {
    version: 2,
    id: 'p',
    name: 'p',
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#000000',
    duration: 20,
    createdAt: '',
    updatedAt: '',
    assets: [],
    markers: [],
    tracks: [
      { id: 'manual', name: '字幕', kind: 'subtitle', muted: false, locked: false, visible: true, clips: [] },
      { id: 'video', name: 'Video', kind: 'video', muted: false, locked: false, visible: true, clips: [] },
    ],
  };
}

function transcript(): TranscriptDocument {
  return {
    id: 't',
    source: 'manual',
    updatedAt: '',
    segments: [
      {
        id: 's1',
        start: 2,
        end: 5,
        text: 'こんにちは 世界',
        speaker: 'ずんだもん',
        words: [
          { text: 'こんにちは', start: 2, end: 3.2 },
          { text: '世界', start: 3.4, end: 5 },
        ],
      },
      { id: 's2', start: 24, end: 27, text: '二つ目' },
    ],
  };
}

describe('transcript captions', () => {
  it('creates a dedicated subtitle track without replacing manual subtitles', () => {
    const input = project();
    const result = applyTranscriptAsSubtitles(input, transcript());
    expect(result.clipCount).toBe(2);
    expect(result.reason).toBeUndefined();
    expect(result.project.tracks.find((track) => track.id === 'manual')).toBe(input.tracks[0]);
    const generated = result.project.tracks.find((track) => track.name === TRANSCRIPT_SUBTITLE_TRACK_NAME);
    expect(generated?.kind).toBe('subtitle');
    expect(generated?.clips).toHaveLength(2);
    expect(result.project.duration).toBe(27);
  });

  it('replaces only the existing dedicated transcript subtitle track on refresh', () => {
    const first = applyTranscriptAsSubtitles(project(), transcript()).project;
    const generated = first.tracks.find((track) => track.name === TRANSCRIPT_SUBTITLE_TRACK_NAME)!;
    const nextTranscript = transcript();
    nextTranscript.segments = [{ id: 'new', start: 1, end: 2, text: '更新' }];
    const second = applyTranscriptAsSubtitles(first, nextTranscript);
    const refreshed = second.project.tracks.find((track) => track.id === generated.id);
    expect(refreshed?.clips).toHaveLength(1);
    expect(refreshed?.clips[0].subtitle?.text).toBe('更新');
    expect(second.project.tracks.filter((track) => track.name === TRANSCRIPT_SUBTITLE_TRACK_NAME)).toHaveLength(1);
  });

  it('converts absolute transcript word timings to clip-relative timings', () => {
    const clip = transcriptSegmentToSubtitleClip(transcript().segments[0], 360)!;
    expect(clip.start).toBe(2);
    expect(clip.duration).toBe(3);
    expect(clip.transform.y).toBe(360);
    expect(clip.subtitle).toMatchObject({
      text: 'こんにちは 世界',
      speaker: 'ずんだもん',
      wordHighlight: true,
      highlightColor: '#ffd84d',
    });
    expect(clip.subtitle?.words?.[0]).toMatchObject({ text: 'こんにちは', start: 0 });
    expect(clip.subtitle?.words?.[0].end).toBeCloseTo(1.2, 10);
    expect(clip.subtitle?.words?.[1].text).toBe('世界');
    expect(clip.subtitle?.words?.[1].start).toBeCloseTo(1.4, 10);
    expect(clip.subtitle?.words?.[1].end).toBe(3);
  });

  it('respects a locked generated subtitle track', () => {
    const first = applyTranscriptAsSubtitles(project(), transcript()).project;
    const locked = {
      ...first,
      tracks: first.tracks.map((track) => track.name === TRANSCRIPT_SUBTITLE_TRACK_NAME ? { ...track, locked: true } : track),
    };
    const result = applyTranscriptAsSubtitles(locked, transcript());
    expect(result.reason).toBe('locked-track');
    expect(result.project).toBe(locked);
  });

  it('returns a no-transcript result without changing the project', () => {
    const input = project();
    const result = applyTranscriptAsSubtitles(input, undefined);
    expect(result).toMatchObject({ project: input, clipCount: 0, reason: 'no-transcript' });
  });
});
