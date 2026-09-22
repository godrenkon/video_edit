import { describe, expect, it } from 'vitest';
import type { Clip, Project } from '../types/editor';
import { copyClip } from './clipboardOps';
import {
  deleteClipsCommand,
  duplicateClipCommand,
  groupClipsCommand,
  moveClipCommand,
  moveClipsCommand,
  moveClipToTrackCommand,
  nudgeClipCommand,
  nudgeClipsCommand,
  pasteClipCommand,
  replayEditorCommands,
  rippleDeleteCommand,
  rippleTrimCommand,
  slideEditCommand,
  splitClipCommand,
  trimLeftCommand,
  trimRightCommand,
  ungroupClipsCommand,
  type EditorCommandPayload,
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
    start: 5,
  };
  const third: Clip = {
    ...first,
    id: 'clip-c',
    name: 'C',
    start: 9,
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
    assets: [{
      id: 'asset-a',
      name: 'A',
      kind: 'video',
      mime: 'video/mp4',
      size: 1,
      duration: 30,
      storageName: 'a.mp4',
    }],
    markers: [],
    tracks: [
      {
        id: 'video',
        name: 'Video',
        kind: 'video',
        muted: false,
        locked: false,
        syncLock: true,
        targeted: true,
        visible: true,
        clips: [first, second, third],
      },
      {
        id: 'overlay',
        name: 'Overlay',
        kind: 'overlay',
        muted: false,
        locked: false,
        syncLock: true,
        visible: true,
        clips: [],
      },
    ],
  };
}

describe('EditorCommand factories', () => {
  it('exposes stable labels, payloads and coalescing keys for continuous edits', () => {
    expect(moveClipCommand('clip-a', 2)).toMatchObject({
      label: 'クリップ移動',
      coalesceKey: 'clip:clip-a:move',
      payload: { type: 'move-clip', clipId: 'clip-a', start: 2 },
    });
    expect(trimRightCommand('clip-a', 4)).toMatchObject({
      label: '右トリム',
      coalesceKey: 'clip:clip-a:trim-right',
      payload: { type: 'trim-right', clipId: 'clip-a', end: 4 },
    });
    expect(nudgeClipCommand('clip-a', 1)).toMatchObject({
      label: 'クリップをフレーム移動',
      coalesceKey: 'clip:clip-a:nudge',
      payload: { type: 'nudge-clip', clipId: 'clip-a', frames: 1 },
    });
  });

  it('applies movement without mutating the input project', () => {
    const input = makeProject();
    const output = moveClipCommand('clip-a', 2.2, undefined, 0).apply(input);

    expect(output).not.toBe(input);
    expect(input.tracks[0].clips[0].start).toBe(1);
    expect(output.tracks[0].clips[0].start).toBeCloseTo(2.2, 10);
  });

  it('applies split and sync-lock ripple-delete commands through the same reducer', () => {
    const input = makeProject();
    const split = splitClipCommand('clip-a', 3).apply(input);
    expect(split.tracks[0].clips).toHaveLength(4);

    const deleted = rippleDeleteCommand('clip-a', 'sync-lock').apply(input);
    expect(deleted.tracks[0].clips.map((clip) => clip.id)).toEqual(['clip-b', 'clip-c']);
    expect(deleted.tracks[0].clips[0].start).toBe(1);
  });

  it('replays JSON-round-tripped payloads deterministically', () => {
    const input = makeProject();
    const payloads: EditorCommandPayload[] = [
      trimLeftCommand('clip-a', 2, undefined, 0).payload,
      trimRightCommand('clip-c', 12, undefined, 0).payload,
      moveClipToTrackCommand('clip-b', 'overlay', 6, undefined, 0).payload,
      nudgeClipCommand('clip-b', 1).payload,
    ];
    const restored = JSON.parse(JSON.stringify(payloads)) as EditorCommandPayload[];

    expect(replayEditorCommands(input, restored)).toEqual(replayEditorCommands(input, payloads));
    expect(input.tracks[0].clips.map((clip) => clip.id)).toEqual(['clip-a', 'clip-b', 'clip-c']);
  });

  it('routes advanced edit commands through serializable payloads', () => {
    const input = makeProject();
    const slid = slideEditCommand('clip-b', 6).apply(input);
    expect(slid.tracks[0].clips.find((clip) => clip.id === 'clip-b')?.start).toBe(6);

    const rippled = rippleTrimCommand('clip-a', 'right', 4, undefined, 0, 'sync-lock').apply(input);
    expect(rippled.tracks[0].clips.find((clip) => clip.id === 'clip-a')?.duration).toBe(3);
    expect(rippled.tracks[0].clips.find((clip) => clip.id === 'clip-b')?.start).toBe(4);
  });

  it('replays multi-clip movement, grouping and deletion with captured identities', () => {
    const input = makeProject();
    const grouped = groupClipsCommand(['clip-a', 'clip-b'], 'group-fixed');
    const payloads: EditorCommandPayload[] = [
      grouped.payload,
      moveClipsCommand(['clip-b', 'clip-a'], 1).payload,
      nudgeClipsCommand(['clip-a', 'clip-b'], 1).payload,
      ungroupClipsCommand(['clip-a']).payload,
      deleteClipsCommand(['clip-c']).payload,
    ];
    const output = replayEditorCommands(input, JSON.parse(JSON.stringify(payloads)) as EditorCommandPayload[]);

    expect(grouped.payload).toEqual({
      type: 'group-clips',
      clipIds: ['clip-a', 'clip-b'],
      groupId: 'group-fixed',
    });
    expect(output.tracks[0].clips.map((clip) => clip.id)).toEqual(['clip-a', 'clip-b']);
    expect(output.tracks[0].clips.every((clip) => clip.groupId === undefined)).toBe(true);
    expect(output.tracks[0].clips[0].start).toBeCloseTo(2 + 1 / 30, 10);
    expect(output.tracks[0].clips[1].start).toBeCloseTo(6 + 1 / 30, 10);
  });

  it('captures fresh clipboard identities once so duplicate and paste replay deterministically', () => {
    const input = makeProject();
    const duplicate = duplicateClipCommand(input, 'clip-a');
    const clipboard = copyClip(input, 'clip-b');
    const paste = clipboard ? pasteClipCommand(input, clipboard, 14) : null;
    expect(duplicate?.createdClipId).toBeTruthy();
    expect(paste?.createdClipId).toBeTruthy();

    const payloads = [duplicate!.payload, paste!.payload];
    const restored = JSON.parse(JSON.stringify(payloads)) as EditorCommandPayload[];
    const first = replayEditorCommands(input, payloads);
    const replayed = replayEditorCommands(input, restored);
    expect(replayed).toEqual(first);
    expect(first.tracks[0].clips.map((clip) => clip.id)).toContain(duplicate!.createdClipId);
    expect(first.tracks[0].clips.map((clip) => clip.id)).toContain(paste!.createdClipId);
    expect(first.tracks[0].clips.find((clip) => clip.id === paste!.createdClipId)?.start).toBe(14);
  });

  it('does not add the same prepared clip identity twice', () => {
    const input = makeProject();
    const duplicate = duplicateClipCommand(input, 'clip-a')!;
    const once = duplicate.apply(input);
    expect(duplicate.apply(once)).toBe(once);
  });

  it('keeps replay a no-op when command preconditions fail', () => {
    const input = makeProject();
    const locked: Project = {
      ...input,
      tracks: input.tracks.map((track) => track.id === 'video' ? { ...track, locked: true } : track),
    };
    const payloads: EditorCommandPayload[] = [
      moveClipCommand('clip-a', 10).payload,
      splitClipCommand('clip-a', 3).payload,
    ];

    expect(replayEditorCommands(locked, payloads)).toEqual(locked);
  });
});
