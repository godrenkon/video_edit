import { describe, expect, it } from 'vitest';
import type { Project, Track, TrackKind } from '../types/editor';
import { addTrack, canRemoveTrack, moveTrack, removeTrack, renameTrack, setTrackGain, setTrackMuted, setTrackPan, setTrackSolo, setTrackVisible } from './trackOps';

function track(id: string, kind: TrackKind, clips: Track['clips'] = []): Track {
  return { id, name: id, kind, muted: false, locked: false, visible: true, clips };
}

function project(tracks: Track[]): Project {
  return {
    version: 2,
    id: 'p',
    name: 'tracks',
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#000',
    duration: 10,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    assets: [],
    markers: [],
    tracks,
  };
}

describe('track operations', () => {
  it('adds a track after the last track of the same kind and generates a stable label', () => {
    const input = project([
      track('overlay', 'overlay'),
      { ...track('video-1', 'video'), name: 'ビデオ 1' },
      track('audio', 'audio'),
    ]);
    const next = addTrack(input, 'video');
    expect(next.tracks.map((item) => item.kind)).toEqual(['overlay', 'video', 'video', 'audio']);
    expect(next.tracks[2].name).toBe('ビデオ 2');
    expect(next.tracks[2]).toMatchObject({ gain: 1, pan: 0, syncLock: true, targeted: false, clips: [] });
  });

  it('renames and reorders tracks without mutating the source project', () => {
    const input = project([track('a', 'video'), track('b', 'video')]);
    const renamed = renameTrack(input, 'b', 'Camera B');
    const moved = moveTrack(renamed, 'b', -1);
    expect(input.tracks.map((item) => item.name)).toEqual(['a', 'b']);
    expect(moved.tracks.map((item) => item.id)).toEqual(['b', 'a']);
    expect(moved.tracks[0].name).toBe('Camera B');
  });

  it('refuses to remove a non-empty track', () => {
    const clip = {
      id: 'clip', kind: 'asset' as const, name: 'clip', assetId: 'asset', start: 0, duration: 1, inPoint: 0,
      volume: 1, muted: false, transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    };
    const input = project([track('v1', 'video', [clip]), track('v2', 'video')]);
    expect(canRemoveTrack(input, 'v1')).toEqual({ allowed: false, reason: 'not-empty' });
    expect(removeTrack(input, 'v1')).toMatchObject({ project: input, removed: false, reason: 'not-empty' });
  });

  it('refuses to remove the last track of a kind but removes an extra empty track', () => {
    const single = project([track('v1', 'video')]);
    expect(removeTrack(single, 'v1')).toMatchObject({ project: single, removed: false, reason: 'last-of-kind' });

    const input = project([track('v1', 'video'), track('v2', 'video')]);
    const result = removeTrack(input, 'v2');
    expect(result.removed).toBe(true);
    expect(result.project.tracks.map((item) => item.id)).toEqual(['v1']);
  });

  it('supports bounded track gain and pan controls', () => {
    const input = project([track('v', 'video'), track('a', 'audio')]);
    const louder = setTrackGain(input, 'a', 1.5);
    const panned = setTrackPan(louder, 'a', -0.4);
    expect(panned.tracks.find((item) => item.id === 'a')).toMatchObject({ gain: 1.5, pan: -0.4 });
    expect(setTrackGain(panned, 'a', 99).tracks.find((item) => item.id === 'a')?.gain).toBe(4);
    expect(setTrackPan(panned, 'a', -9).tracks.find((item) => item.id === 'a')?.pan).toBe(-1);
    expect(input.tracks.find((item) => item.id === 'a')?.gain).toBeUndefined();
  });

  it('supports mute, solo and visibility states without changing unrelated tracks', () => {
    const input = project([track('v', 'video'), track('a', 'audio')]);
    const muted = setTrackMuted(input, 'a', true);
    const soloed = setTrackSolo(muted, 'a', true);
    const hidden = setTrackVisible(soloed, 'v', false);
    expect(hidden.tracks.find((item) => item.id === 'a')).toMatchObject({ muted: true, solo: true });
    expect(hidden.tracks.find((item) => item.id === 'v')?.visible).toBe(false);
    expect(input.tracks[0].visible).toBe(true);
    expect(input.tracks[1].solo).toBeUndefined();
  });
});
