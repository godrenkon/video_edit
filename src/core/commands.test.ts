import { describe, expect, it } from 'vitest';
import type { Clip, Project } from '../types/editor';
import {
  moveClipCommand,
  nudgeClipCommand,
  rippleDeleteCommand,
  splitClipCommand,
  trimRightCommand,
} from './commands';

function makeProject(): Project {
  const first: Clip = {
    id: 'clip-a',
    kind: 'asset',
    name: 'A',
    assetId: 'asset-a',
    start: 1,
    duration: 4,
    inPoint: 0,
    volume: 1,
    muted: false,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    speed: 1,
    effects: [],
  };
  const second: Clip = {
    ...first,
    id: 'clip-b',
    name: 'B',
    start: 6,
  };

  return {
    version: 2,
    id: 'project',
    name: 'Commands',
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#000',
    duration: 20,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    assets: [],
    markers: [],
    tracks: [
      {
        id: 'video',
        name: 'Video',
        kind: 'video',
        muted: false,
        locked: false,
        visible: true,
        clips: [first, second],
      },
    ],
  };
}

describe('EditorCommand factories', () => {
  it('exposes stable labels and coalescing keys for continuous edits', () => {
    expect(moveClipCommand('clip-a', 2)).toMatchObject({
      label: 'クリップ移動',
      coalesceKey: 'clip:clip-a:move',
    });
    expect(trimRightCommand('clip-a', 4)).toMatchObject({
      label: '右トリム',
      coalesceKey: 'clip:clip-a:trim-right',
    });
    expect(nudgeClipCommand('clip-a', 1)).toMatchObject({
      label: 'クリップをフレーム移動',
      coalesceKey: 'clip:clip-a:nudge',
    });
  });

  it('applies movement without mutating the input project', () => {
    const input = makeProject();
    const output = moveClipCommand('clip-a', 2.2, undefined, 0).apply(input);

    expect(output).not.toBe(input);
    expect(input.tracks[0].clips[0].start).toBe(1);
    expect(output.tracks[0].clips[0].start).toBeCloseTo(2.2, 10);
  });

  it('applies split and ripple-delete commands through the same deterministic operation layer', () => {
    const input = makeProject();
    const split = splitClipCommand('clip-a', 3).apply(input);
    expect(split.tracks[0].clips).toHaveLength(3);

    const deleted = rippleDeleteCommand('clip-a').apply(input);
    expect(deleted.tracks[0].clips.map((clip) => clip.id)).toEqual(['clip-b']);
    expect(deleted.tracks[0].clips[0].start).toBe(2);
  });
});
