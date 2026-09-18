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
    expect(sorted.map((item) => [item.name, item.start, item.duration])).toEqual([
      ['a', 0, 3],
      ['new', 3, 2],
      ['a', 5, 3],
      ['b', 10, 2],
    ]);
    expect(sorted[2].inPoint).toBe(5);
  });

  it('overwrite removes only the covered range and preserves both sides', () => {
    const input = project([clip('a', 0, 10, 1)]);
    const incoming = clip('new', 0, 3);
    const output = overwriteClipAt(input, 'video', incoming, 3);
    const sorted = [...output.tracks[0].clips].sort((a, b) => a.start - b.start);
    expect(sorted.map((item) => [item.name, item.start, item.duration])).toEqual([
      ['a', 0, 3],
      ['new', 3, 3],
      ['a', 6, 4],
    ]);
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
