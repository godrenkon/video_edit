import { describe, expect, it } from 'vitest';
import type { AssetMeta, Clip, Project, Track } from '../types/editor';
import {
  moveClip,
  nudgeClip,
  quantizeToFrame,
  rippleDeleteClip,
  slipClipSource,
  snapTime,
  splitClipAt,
  trimClipLeft,
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

function asset(id: string, duration: number): AssetMeta {
  return {
    id: `asset-${id}`,
    name: id,
    kind: 'video',
    mime: 'video/webm',
    size: 1,
    duration,
    width: 1920,
    height: 1080,
    storageName: `${id}.webm`,
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

function project(tracks: Track[], assets: AssetMeta[] = []): Project {
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
    assets,
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

  it('splits a forward clip on a frame boundary and advances the source in-point', () => {
    const source = clip('a', 2, 6, { inPoint: 1.5, speed: 2 });
    const output = splitClipAt(project([track('v1', [source])]), 'a', 5);
    const [left, right] = output.tracks[0].clips;
    expect(left.id).toBe('a');
    expect(left.duration).toBe(3);
    expect(right.id).not.toBe('a');
    expect(right.start).toBe(5);
    expect(right.duration).toBe(3);
    expect(right.inPoint).toBe(7.5);
  });

  it('keeps only the original outer dissolve transitions after a split', () => {
    const source = clip('a', 2, 6, {
      transitionIn: { kind: 'dissolve', duration: 1 },
      transitionOut: { kind: 'dissolve', duration: 1.5 },
    });
    const output = splitClipAt(project([track('v1', [source])]), 'a', 5);
    const [left, right] = output.tracks[0].clips;
    expect(left.transitionIn).toEqual({ kind: 'dissolve', duration: 1 });
    expect(left.transitionOut).toBeUndefined();
    expect(right.transitionIn).toBeUndefined();
    expect(right.transitionOut).toEqual({ kind: 'dissolve', duration: 1.5 });
  });

  it('splits reverse media without changing the sampled source range', () => {
    const source = clip('a', 2, 6, { inPoint: 1, speed: 2, reverse: true });
    const output = splitClipAt(project([track('v1', [source])]), 'a', 5);
    const [left, right] = output.tracks[0].clips;
    expect(left.duration).toBe(3);
    expect(left.inPoint).toBe(7);
    expect(right.duration).toBe(3);
    expect(right.inPoint).toBe(1);
  });

  it('does not modify locked tracks', () => {
    const input = project([track('locked', [clip('a', 2, 4)], true)]);
    expect(splitClipAt(input, 'a', 4)).toBe(input);
    expect(moveClip(input, 'a', 10)).toBe(input);
    expect(trimClipLeft(input, 'a', 3)).toBe(input);
    expect(trimClipRight(input, 'a', 7)).toBe(input);
    expect(slipClipSource(input, 'a', 1)).toBe(input);
    expect(nudgeClip(input, 'a', 1)).toBe(input);
    expect(rippleDeleteClip(input, 'a')).toBe(input);
  });

  it('left-trims media, advances the in-point and preserves effect value at the new boundary', () => {
    const source = clip('a', 2, 6, {
      inPoint: 1,
      effects: [{
        id: 'fx',
        kind: 'brightness-contrast',
        enabled: true,
        parameters: {
          brightness: {
            value: 0,
            keyframes: [
              { id: 'k1', time: 0, value: 0, interpolation: 'linear' },
              { id: 'k2', time: 6, value: 1, interpolation: 'linear' },
            ],
          },
        },
      }],
    });
    const result = trimClipLeft(project([track('v1', [source])]), 'a', 5).tracks[0].clips[0];
    expect(result.start).toBe(5);
    expect(result.duration).toBe(3);
    expect(result.inPoint).toBe(4);
    const keyframes = result.effects?.[0].parameters.brightness.keyframes ?? [];
    expect(keyframes[0].time).toBe(0);
    expect(keyframes[0].value).toBeCloseTo(0.5);
    expect(keyframes.at(-1)?.time).toBe(3);
  });

  it('right-trims reverse media while preserving its timeline-start source sample', () => {
    const source = clip('a', 2, 6, { inPoint: 1, speed: 2, reverse: true });
    const result = trimClipRight(project([track('v1', [source])]), 'a', 5).tracks[0].clips[0];
    expect(result.duration).toBe(3);
    expect(result.inPoint).toBe(7);
    expect(result.inPoint + result.duration * 2).toBe(13);
  });

  it('constrains trim and slip to the available media source range', () => {
    const source = clip('a', 4, 4, { inPoint: 2, speed: 1 });
    const input = project([track('v1', [source])], [asset('a', 8)]);
    expect(trimClipRight(input, 'a', 30).tracks[0].clips[0].duration).toBe(6);
    expect(slipClipSource(input, 'a', 99).tracks[0].clips[0].inPoint).toBe(4);
  });

  it('moves a frozen source frame with slip edits and clamps it to media bounds', () => {
    const source = clip('a', 4, 2, { inPoint: 2, speed: 1, freezeFrameAt: 3 });
    const input = project([track('v1', [source])], [asset('a', 8)]);
    const shifted = slipClipSource(input, 'a', 4).tracks[0].clips[0];
    expect(shifted.inPoint).toBe(4);
    expect(shifted.freezeFrameAt).toBe(5);

    const clamped = slipClipSource(input, 'a', 99).tracks[0].clips[0];
    expect(clamped.inPoint).toBe(6);
    expect(clamped.freezeFrameAt).toBe(7);
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
