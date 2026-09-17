import { describe, expect, it } from 'vitest';
import type { AssetMeta, Clip, Project, Track } from '../types/editor';
import { adjacentPair, rippleTrimClip, rollEditBoundary } from './advancedTimelineOps';

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

function asset(id: string, duration = 30): AssetMeta {
  return {
    id: `asset-${id}`,
    name: id,
    kind: 'video',
    mime: 'video/mp4',
    size: 1,
    duration,
    width: 1920,
    height: 1080,
    storageName: `${id}.mp4`,
  };
}

function track(clips: Clip[], locked = false): Track {
  return {
    id: 'track',
    name: 'Video',
    kind: 'video',
    muted: false,
    locked,
    visible: true,
    clips,
  };
}

function project(clips: Clip[], assets: AssetMeta[], locked = false): Project {
  return {
    version: 2,
    id: 'project',
    name: 'Test',
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#000000',
    duration: 30,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    assets,
    markers: [],
    tracks: [track(clips, locked)],
  };
}

describe('advanced timeline operations', () => {
  it('ripple-trims a right edge and shifts downstream clips by the duration delta', () => {
    const input = project(
      [clip('a', 0, 5), clip('b', 5, 4), clip('c', 10, 2)],
      [asset('a'), asset('b'), asset('c')],
    );
    const output = rippleTrimClip(input, 'a', 'right', 3);
    expect(output.tracks[0].clips.map((item) => [item.id, item.start, item.duration])).toEqual([
      ['a', 0, 3],
      ['b', 3, 4],
      ['c', 8, 2],
    ]);
  });

  it('ripple-trims a left edge while keeping the incoming edit point anchored', () => {
    const input = project(
      [clip('a', 5, 5, { inPoint: 2 }), clip('b', 10, 3)],
      [asset('a'), asset('b')],
    );
    const output = rippleTrimClip(input, 'a', 'left', 7);
    const [a, b] = output.tracks[0].clips;
    expect(a.start).toBe(5);
    expect(a.duration).toBe(3);
    expect(a.inPoint).toBe(4);
    expect(b.start).toBe(8);
  });

  it('rolls an adjacent cut without changing the outer span', () => {
    const input = project(
      [clip('a', 0, 5, { inPoint: 1 }), clip('b', 5, 5, { inPoint: 2 })],
      [asset('a'), asset('b')],
    );
    const output = rollEditBoundary(input, 'a', 'right', 6.5);
    const [a, b] = output.tracks[0].clips;
    expect(a.start).toBe(0);
    expect(a.duration).toBe(6.5);
    expect(b.start).toBe(6.5);
    expect(b.duration).toBe(3.5);
    expect(b.inPoint).toBe(3.5);
    expect(b.start + b.duration).toBe(10);
  });

  it('roll edit clamps to source availability and keeps the cut gapless', () => {
    const input = project(
      [clip('a', 0, 5, { inPoint: 0 }), clip('b', 5, 5, { inPoint: 0 })],
      [asset('a', 5.5), asset('b', 20)],
    );
    const output = rollEditBoundary(input, 'a', 'right', 8);
    const [a, b] = output.tracks[0].clips;
    expect(a.duration).toBe(5.5);
    expect(b.start).toBe(5.5);
    expect(a.start + a.duration).toBe(b.start);
  });

  it('requires a directly adjacent pair for roll editing', () => {
    const input = project(
      [clip('a', 0, 4), clip('b', 5, 4)],
      [asset('a'), asset('b')],
    );
    expect(adjacentPair(input, 'a', 'right')).toBeNull();
    expect(rollEditBoundary(input, 'a', 'right', 4.5)).toBe(input);
  });

  it('does not ripple or roll locked tracks', () => {
    const input = project(
      [clip('a', 0, 5), clip('b', 5, 5)],
      [asset('a'), asset('b')],
      true,
    );
    expect(rippleTrimClip(input, 'a', 'right', 3)).toBe(input);
    expect(rollEditBoundary(input, 'a', 'right', 6)).toBe(input);
  });
});
