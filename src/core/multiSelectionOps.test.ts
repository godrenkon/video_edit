import { describe, expect, it } from 'vitest';
import type { Clip, Project, Track } from '../types/editor';
import { deleteSelectedClips, existingClipIds, moveSelectedClipsByDelta, nudgeSelectedClips } from './multiSelectionOps';

function clip(id: string, start: number): Clip {
  return {
    id,
    kind: 'asset',
    name: id,
    start,
    duration: 2,
    inPoint: 0,
    volume: 1,
    muted: false,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
  };
}

function track(id: string, clips: Clip[], locked = false): Track {
  return { id, name: id, kind: 'video', muted: false, locked, visible: true, clips };
}

function project(tracks: Track[]): Project {
  return {
    version: 2,
    id: 'p',
    name: 'p',
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#000',
    duration: 30,
    createdAt: '',
    updatedAt: '',
    assets: [],
    markers: [],
    tracks,
  };
}

describe('multi selection operations', () => {
  it('normalizes requested ids to clips that still exist', () => {
    const p = project([track('v1', [clip('a', 1), clip('b', 3)])]);
    expect(existingClipIds(p, ['missing', 'b', 'a'])).toEqual(['a', 'b']);
  });

  it('deletes selected clips from unlocked tracks while preserving locked tracks', () => {
    const p = project([
      track('v1', [clip('a', 1), clip('b', 3)]),
      track('locked', [clip('c', 5)], true),
    ]);
    const next = deleteSelectedClips(p, ['a', 'c']);
    expect(next.tracks[0].clips.map((item) => item.id)).toEqual(['b']);
    expect(next.tracks[1].clips.map((item) => item.id)).toEqual(['c']);
  });

  it('moves selected clips by one shared frame-quantized delta', () => {
    const p = project([track('v1', [clip('a', 1), clip('b', 3.5), clip('c', 8)])]);
    const next = moveSelectedClipsByDelta(p, ['a', 'b'], 0.049);
    expect(next.tracks[0].clips[0].start).toBeCloseTo(1 + 1 / 30, 10);
    expect(next.tracks[0].clips[1].start).toBeCloseTo(3.5 + 1 / 30, 10);
    expect(next.tracks[0].clips[2].start).toBe(8);
  });

  it('clamps a group move at zero without changing relative offsets', () => {
    const p = project([track('v1', [clip('a', 0.5), clip('b', 2)])]);
    const next = moveSelectedClipsByDelta(p, ['a', 'b'], -5);
    expect(next.tracks[0].clips[0].start).toBe(0);
    expect(next.tracks[0].clips[1].start).toBe(1.5);
  });

  it('nudges the whole editable selection by exact frames', () => {
    const p = project([
      track('v1', [clip('a', 1)]),
      track('v2', [clip('b', 2)]),
      track('locked', [clip('c', 3)], true),
    ]);
    const next = nudgeSelectedClips(p, ['a', 'b', 'c'], 2);
    expect(next.tracks[0].clips[0].start).toBeCloseTo(1 + 2 / 30, 10);
    expect(next.tracks[1].clips[0].start).toBeCloseTo(2 + 2 / 30, 10);
    expect(next.tracks[2].clips[0].start).toBe(3);
  });
});
