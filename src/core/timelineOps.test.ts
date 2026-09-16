import { describe, expect, it } from 'vitest';
import type { Clip, Project, Track } from '../types/editor';
import {
  moveClip,
  nudgeClip,
  quantizeToFrame,
  rippleDeleteClip,
  snapTime,
  splitClipAt,
  trimClipRight,
} from './timelineOps';

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

function track(id: string, clips: Clip[], locked = false): Track {
  return {
    id,
    name: id,
    kind: 'video',
    muted: false,
    locked,
    visible: true,
    clips,
  };
}

function project(tracks: Track[]): Project {
  return {
    version: 2,
    id: 'project',
    name: 'Test',
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#000',
    duration: 30,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    assets: [],
    markers: [{ id: 'marker', time: 8, name: 'Marker' }],
    tracks,
  };
}

describe('timeline operations', () => {
  it('quantizes time to exact frame boundaries', () => {
    expect(quantizeToFrame(1.02, 30)).toBeCloseTo(31 / 30, 10);
    expect(quantizeToFrame(-3, 30)).toBe(0);
  });

  it('snaps movement to nearby clip edges, markers and playhead', () => {
    const input = project([track('v1', [clip('moving', 1, 2), clip('anchor', 5, 2)])]);

    expect(snapTime(input, 4.94, 'moving')).toBe(5);
    expect(snapTime(input, 7.94, 'moving')).toBe(8);
    expect(snapTime(input, 9.94, 'moving', 10)).toBe(10);
    expect(snapTime(input, 12.4, 'moving')).toBeCloseTo(12.4, 10);
  });

  it('splits a clip on a frame boundary and advances the source in-point', () => {
    const source = clip('a', 2, 6, { inPoint: 1.5, speed: 2 });
    const input = project([track('v1', [source])]);
    const output = splitClipAt(input, 'a', 5);

    expect(output).not.toBe(input);
    expect(output.tracks[0].clips).toHaveLength(2);
    const [left, right] = output.tracks[0].clips;
    expect(left.id).toBe('a');
    expect(left.duration).toBe(3);
    expect(right.id).not.toBe('a');
    expect(right.start).toBe(5);
    expect(right.duration).toBe(3);
    expect(right.inPoint).toBe(7.5);
  });

  it('does not modify locked tracks', () => {
    const input = project([track('locked', [clip('a', 2, 4)], true)]);

    expect(splitClipAt(input, 'a', 4)).toBe(input);
    expect(moveClip(input, 'a', 10)).toBe(input);
    expect(trimClipRight(input, 'a', 7)).toBe(input);
    expect(nudgeClip(input, 'a', 1)).toBe(input);
    expect(rippleDeleteClip(input, 'a')).toBe(input);
  });

  it('ripples only the source track by default', () => {
    const input = project([
      track('v1', [clip('delete', 2, 3), clip('after', 6, 2)]),
      track('v2', [clip('other', 7, 1)]),
    ]);
    const output = rippleDeleteClip(input, 'delete');

    expect(output.tracks[0].clips.map((item) => [item.id, item.start])).toEqual([['after', 3]]);
    expect(output.tracks[1].clips[0].start).toBe(7);
  });

  it('ripples every unlocked track when explicitly requested and leaves locked tracks alone', () => {
    const input = project([
      track('v1', [clip('delete', 2, 3), clip('after', 6, 2)]),
      track('v2', [clip('other', 7, 1)]),
      track('locked', [clip('locked-after', 8, 1)], true),
    ]);
    const output = rippleDeleteClip(input, 'delete', true);

    expect(output.tracks[0].clips[0].start).toBe(3);
    expect(output.tracks[1].clips[0].start).toBe(4);
    expect(output.tracks[2].clips[0].start).toBe(8);
  });

  it('nudges by whole frames and keeps clips at or after zero', () => {
    const input = project([track('v1', [clip('a', 1, 2)])]);
    expect(nudgeClip(input, 'a', 1).tracks[0].clips[0].start).toBeCloseTo(31 / 30, 10);

    const atStart = project([track('v1', [clip('a', 0, 2)])]);
    expect(nudgeClip(atStart, 'a', -1).tracks[0].clips[0].start).toBe(0);
  });
});
