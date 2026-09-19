import { describe, expect, it } from 'vitest';
import type { Clip, Project, Track, TranscriptDocument } from '../types/editor';
import { normalizeTimeRanges, rippleDeleteTimeRanges } from './timeRangeEdit';

function makeClip(id: string, start: number, duration: number, inPoint = 0): Clip {
  return {
    id,
    kind: 'text',
    name: id,
    start,
    duration,
    inPoint,
    volume: 1,
    muted: false,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    text: { text: id },
  };
}

function makeTrack(id: string, clips: Clip[], locked = false): Track {
  return {
    id,
    name: id,
    kind: 'video',
    muted: false,
    locked,
    clips,
  };
}

function makeProject(tracks: Track[], transcript?: TranscriptDocument): Project {
  return {
    version: 2,
    id: 'project',
    name: 'test',
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#000',
    duration: 20,
    createdAt: '',
    updatedAt: '',
    assets: [],
    tracks,
    markers: [],
    transcript,
  };
}

describe('time range ripple delete', () => {
  it('normalizes, quantizes and merges overlapping ranges', () => {
    expect(normalizeTimeRanges([
      { start: 4, end: 2 },
      { start: 3.5, end: 6 },
      { start: 10, end: 10.001 },
    ], 30)).toEqual([
      { start: 2, end: 6 },
    ]);
  });

  it('cuts through a clip and preserves source timing on both sides', () => {
    const source = makeProject([makeTrack('v1', [makeClip('clip', 0, 10)])]);
    const result = rippleDeleteTimeRanges(source, [{ start: 2, end: 4 }]);

    expect(result.blockedTrackIds).toEqual([]);
    expect(result.removedSeconds).toBeCloseTo(2, 8);

    const clips = [...result.project.tracks[0].clips].sort((a, b) => a.start - b.start);
    expect(clips).toHaveLength(2);
    expect(clips[0]).toMatchObject({ start: 0, duration: 2, inPoint: 0 });
    expect(clips[1]).toMatchObject({ start: 2, duration: 6, inPoint: 4 });
  });

  it('shifts later clips and processes multiple ranges from the end backwards', () => {
    const source = makeProject([makeTrack('v1', [
      makeClip('a', 0, 6),
      makeClip('b', 8, 4),
      makeClip('c', 14, 2),
    ])]);

    const result = rippleDeleteTimeRanges(source, [
      { start: 2, end: 4 },
      { start: 10, end: 12 },
    ]);

    expect(result.removedSeconds).toBeCloseTo(4, 8);
    const clips = result.project.tracks[0].clips;
    expect(Math.max(...clips.map((clip) => clip.start + clip.duration))).toBeCloseTo(12, 8);
    expect(clips.some((clip) => clip.id === 'c' && Math.abs(clip.start - 10) < 1e-8)).toBe(true);
  });

  it('refuses a global ripple when locked timeline content would desynchronize', () => {
    const source = makeProject([
      makeTrack('v1', [makeClip('a', 0, 10)]),
      makeTrack('locked', [makeClip('b', 5, 2)], true),
    ]);
    const result = rippleDeleteTimeRanges(source, [{ start: 2, end: 4 }]);

    expect(result.project).toBe(source);
    expect(result.removedRanges).toEqual([]);
    expect(result.blockedTrackIds).toEqual(['locked']);
  });

  it('retimes markers, transcript segments and in/out points with the cut', () => {
    const transcript: TranscriptDocument = {
      id: 't',
      source: 'manual',
      updatedAt: '',
      segments: [
        { id: 'before', start: 0, end: 1, text: 'before' },
        { id: 'filler', start: 2.5, end: 3.5, text: 'えっと' },
        { id: 'after', start: 5, end: 7, text: 'after', words: [{ text: 'after', start: 5, end: 6 }] },
      ],
    };
    const source = makeProject([makeTrack('v1', [makeClip('clip', 0, 10)])], transcript);
    source.markers = [
      { id: 'inside', time: 3, name: 'inside' },
      { id: 'after', time: 8, name: 'after' },
    ];
    source.inPoint = 1;
    source.outPoint = 8;

    const result = rippleDeleteTimeRanges(source, [{ start: 2, end: 4 }]);
    expect(result.project.markers).toEqual([{ id: 'after', time: 6, name: 'after' }]);
    expect(result.project.transcript?.segments.map((segment) => ({
      id: segment.id,
      start: segment.start,
      end: segment.end,
    }))).toEqual([
      { id: 'before', start: 0, end: 1 },
      { id: 'after', start: 3, end: 5 },
    ]);
    expect(result.project.transcript?.segments[1].words).toEqual([
      { text: 'after', start: 3, end: 4 },
    ]);
    expect(result.project.inPoint).toBe(1);
    expect(result.project.outPoint).toBe(6);
  });
});
