import { describe, expect, it } from 'vitest';
import type { Clip, Project, Track } from '../types/editor';
import { cloneClipWithFreshIds, copyClip, duplicateClipAfter, pasteClipAt } from './clipboardOps';

function clip(): Clip {
  return {
    id: 'clip-a',
    kind: 'asset',
    name: 'A',
    assetId: 'asset-a',
    start: 2,
    duration: 3,
    inPoint: 1,
    volume: 0.8,
    muted: false,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    effects: [{
      id: 'fx-a',
      kind: 'brightness-contrast',
      enabled: true,
      parameters: {
        brightness: {
          value: 0,
          keyframes: [{ id: 'kf-a', time: 1, value: 0.5, interpolation: 'linear' }],
        },
      },
    }],
  };
}

function project(source: Clip, locked = false): Project {
  const track: Track = {
    id: 'track',
    name: 'Video',
    kind: 'video',
    muted: false,
    locked,
    visible: true,
    clips: [source],
  };
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
    markers: [],
    tracks: [track],
  };
}

describe('clip duplication', () => {
  it('places the duplicate directly after the source clip', () => {
    const input = project(clip());
    const result = duplicateClipAfter(input, 'clip-a');
    expect(result.clipId).toBeTruthy();
    expect(result.project.tracks[0].clips).toHaveLength(2);
    expect(result.project.tracks[0].clips[1].start).toBe(5);
    expect(result.project.tracks[0].clips[1].duration).toBe(3);
  });

  it('assigns fresh clip, effect and keyframe identities', () => {
    const source = clip();
    const copy = cloneClipWithFreshIds(source);
    expect(copy.id).not.toBe(source.id);
    expect(copy.effects?.[0].id).not.toBe(source.effects?.[0].id);
    expect(copy.effects?.[0].parameters.brightness.keyframes?.[0].id)
      .not.toBe(source.effects?.[0].parameters.brightness.keyframes?.[0].id);
  });

  it('deeply isolates nested editable values', () => {
    const source = clip();
    const copy = cloneClipWithFreshIds(source);
    copy.effects![0].parameters.brightness.keyframes![0].value = 1;
    expect(source.effects![0].parameters.brightness.keyframes![0].value).toBe(0.5);
  });

  it('copies a clip payload and pastes it at a frame-quantized playhead position', () => {
    const input = project(clip());
    const payload = copyClip(input, 'clip-a');
    expect(payload?.trackKind).toBe('video');
    const result = pasteClipAt(input, payload!, 8.017);
    expect(result.clipId).toBeTruthy();
    expect(result.project.tracks[0].clips[1].start).toBeCloseTo(8.0333333333, 8);
    expect(result.project.tracks[0].clips[1].id).not.toBe('clip-a');
  });

  it('does not paste when no unlocked compatible track exists', () => {
    const input = project(clip(), true);
    const payload = copyClip(input, 'clip-a');
    const result = pasteClipAt(input, payload!, 8);
    expect(result.project).toBe(input);
    expect(result.clipId).toBeNull();
  });

  it('does not duplicate clips on locked tracks', () => {
    const input = project(clip(), true);
    const result = duplicateClipAfter(input, 'clip-a');
    expect(result.project).toBe(input);
    expect(result.clipId).toBeNull();
  });
});
