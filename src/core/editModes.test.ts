import { describe, expect, it } from 'vitest';
import type { Clip, Project, Track } from '../types/editor';
import { insertClipAt, overwriteClipAt } from './editModes';

function clip(id: string, start: number, duration: number, inPoint = 0): Clip {
  return {
    id,
    kind: 'asset',
    name: id,
    assetId: `asset-${id}`,
    start,
    duration,
    inPoint,
    volume: 1,
    muted: false,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    effects: [],
  };
}

function project(clips: Clip[], locked = false): Project {
  const track: Track = {
    id: 'video',
    name: 'Video',
    kind: 'video',
    muted: false,
    locked,
    visible: true,
    clips,
  };
  return {
    version: 2,
    id: 'project',
    name: 'Edit modes',
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#000',
    duration: 30,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    assets: [],
    tracks: [track],
    markers: [],
  };
}

describe('insert / overwrite editing', () => {
  it('insert splits a crossing clip and pushes the right side and later clips', () => {
    const input = project([clip('a', 0, 6, 2), clip('b', 8, 2)]);
    const incoming = clip('new', 0, 2);
    const output = insertClipAt(input, 'video', incoming, 3);
    const sorted = [...output.tracks[0].clips].sort((a, b) => a.start - b.start);
    expect(sorted.map((item) => [item.start, item.duration])).toEqual([
      [0, 3],
      [3, 2],
      [5, 3],
      [10, 2],
    ]);
    expect(sorted[0].name).toBe('a');
    expect(sorted[1].name).toBe('new');
    expect(sorted[2].inPoint).toBe(5);
    expect(sorted[3].name).toBe('b');
  });

  it('insert ripples sync-locked tracks while preserving excluded and locked tracks', () => {
    const input = project([clip('a', 0, 6)]);
    input.tracks[0].syncLock = false;
    input.tracks.push(
      {
        id: 'video-2',
        name: 'Video 2',
        kind: 'video',
        muted: false,
        locked: false,
        syncLock: true,
        visible: true,
        clips: [clip('b', 1, 5)],
      },
      {
        id: 'video-3',
        name: 'Video 3',
        kind: 'video',
        muted: false,
        locked: false,
        syncLock: false,
        visible: true,
        clips: [clip('c', 5, 2)],
      },
      {
        id: 'locked',
        name: 'Locked',
        kind: 'video',
        muted: false,
        locked: true,
        syncLock: true,
        visible: true,
        clips: [clip('d', 5, 2)],
      },
    );

    const output = insertClipAt(input, 'video', clip('new', 0, 2), 3, 'sync-lock');
    const target = [...output.tracks[0].clips].sort((a, b) => a.start - b.start);
    const synced = [...output.tracks[1].clips].sort((a, b) => a.start - b.start);

    expect(target.map((item) => [item.name, item.start, item.duration])).toEqual([
      ['a', 0, 3],
      ['new', 3, 2],
      ['a (2)', 5, 3],
    ]);
    expect(synced.map((item) => [item.start, item.duration, item.inPoint])).toEqual([
      [1, 2, 0],
      [5, 3, 2],
    ]);
    expect(output.tracks[2].clips[0].start).toBe(5);
    expect(output.tracks[3].clips[0].start).toBe(5);
  });

  it('overwrite removes only the covered range and preserves both sides', () => {
    const input = project([clip('a', 0, 10, 1)]);
    const incoming = clip('new', 0, 3);
    const output = overwriteClipAt(input, 'video', incoming, 3);
    const sorted = [...output.tracks[0].clips].sort((a, b) => a.start - b.start);
    expect(sorted.map((item) => [item.start, item.duration])).toEqual([
      [0, 3],
      [3, 3],
      [6, 4],
    ]);
    expect(sorted[0].name).toBe('a');
    expect(sorted[1].name).toBe('new');
    expect(sorted[2].inPoint).toBe(7);
  });

  it('overwrite removes clips fully contained in its range without moving later clips', () => {
    const input = project([clip('a', 0, 2), clip('b', 3, 2), clip('c', 7, 2)]);
    const output = overwriteClipAt(input, 'video', clip('new', 0, 5), 2);
    const sorted = [...output.tracks[0].clips].sort((a, b) => a.start - b.start);
    expect(sorted.map((item) => [item.name, item.start])).toEqual([
      ['a', 0],
      ['new', 2],
      ['c', 7],
    ]);
  });

  it('does not edit locked tracks', () => {
    const input = project([clip('a', 0, 4)], true);
    expect(insertClipAt(input, 'video', clip('new', 0, 2), 1)).toBe(input);
    expect(overwriteClipAt(input, 'video', clip('new', 0, 2), 1)).toBe(input);
  });
});
