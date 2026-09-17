import { describe, expect, it } from 'vitest';
import type { Clip, Project, Track } from '../types/editor';
import { rippleTrimClipRight, rollEditBoundary } from './timelineAdvancedOps';

function clip(id: string, start: number, duration: number, extra: Partial<Clip> = {}): Clip {
  return {
    id,
    kind: 'asset',
    name: id,
    assetId: `asset-${id}`,
    start,
    duration,
    inPoint: 0,
    volume: 1,
    muted: false,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    speed: 1,
    effects: [],
    ...extra,
  };
}

function track(clips: Clip[], locked = false): Track {
  return {
    id: 'v1',
    name: 'Video 1',
    kind: 'video',
    muted: false,
    locked,
    visible: true,
    clips,
  };
}

function project(clips: Clip[], locked = false): Project {
  return {
    version: 2,
    id: 'project',
    name: 'Advanced ops',
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#000000',
    duration: 30,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    assets: [],
    markers: [],
    tracks: [track(clips, locked)],
  };
}

describe('advanced timeline operations', () => {
  it('ripple-trims shorter and pulls later clips left by the trim delta', () => {
    const input = project([
      clip('a', 2, 4),
      clip('b', 7, 2),
      clip('overlap', 5, 4),
    ]);
    const output = rippleTrimClipRight(input, 'a', 5, undefined, 0);

    const [a, b, overlap] = output.tracks[0].clips;
    expect(a.duration).toBe(3);
    expect(b.start).toBe(6);
    expect(overlap.start).toBe(5);
  });

  it('ripple-trims longer and pushes later clips right', () => {
    const input = project([
      clip('a', 2, 4),
      clip('b', 7, 2),
    ]);
    const output = rippleTrimClipRight(input, 'a', 7, undefined, 0);

    expect(output.tracks[0].clips[0].duration).toBe(5);
    expect(output.tracks[0].clips[1].start).toBe(8);
  });

  it('rolls a shared boundary while preserving the combined timeline span', () => {
    const input = project([
      clip('left', 0, 4),
      clip('right', 4, 4, { inPoint: 2 }),
    ]);
    const output = rollEditBoundary(input, 'left', 'right', 5);
    const [left, right] = output.tracks[0].clips;

    expect(left.start).toBe(0);
    expect(left.duration).toBe(5);
    expect(right.start).toBe(5);
    expect(right.duration).toBe(3);
    expect(right.inPoint).toBe(3);
    expect(right.start + right.duration).toBe(8);
  });

  it('clamps roll edits to at least one frame per clip', () => {
    const input = project([
      clip('left', 0, 4),
      clip('right', 4, 4),
    ]);
    const output = rollEditBoundary(input, 'left', 'right', 100);
    const [left, right] = output.tracks[0].clips;

    expect(left.duration).toBeCloseTo(8 - 1 / 30, 8);
    expect(right.duration).toBeCloseTo(1 / 30, 8);
    expect(left.start + left.duration).toBeCloseTo(right.start, 8);
  });

  it('does not modify locked tracks', () => {
    const input = project([clip('a', 0, 4), clip('b', 4, 4)], true);
    expect(rippleTrimClipRight(input, 'a', 3)).toBe(input);
    expect(rollEditBoundary(input, 'a', 'b', 3)).toBe(input);
  });
});
