import type { Project } from '../types/editor';
import { moveClip, nudgeClip, rippleDeleteClip, splitClipAt, trimClipRight } from './timelineOps';

export interface EditorCommand {
  id: string;
  label: string;
  coalesceKey?: string;
  apply(project: Project): Project;
}

const id = (name: string) => `${name}:${crypto.randomUUID()}`;

export function splitClipCommand(clipId: string, time: number): EditorCommand {
  return {
    id: id('split'),
    label: 'クリップ分割',
    apply: (project) => splitClipAt(project, clipId, time),
  };
}

export function rippleDeleteCommand(clipId: string, allUnlockedTracks = false): EditorCommand {
  return {
    id: id('ripple-delete'),
    label: 'リップル削除',
    apply: (project) => rippleDeleteClip(project, clipId, allUnlockedTracks ? 'all' : 'track'),
  };
}

export function moveClipCommand(
  clipId: string,
  start: number,
  playhead?: number,
  snapThreshold?: number,
): EditorCommand {
  return {
    id: id('move'),
    label: 'クリップ移動',
    coalesceKey: `clip:${clipId}:move`,
    apply: (project) => moveClip(project, clipId, start, playhead, snapThreshold),
  };
}

export function trimRightCommand(
  clipId: string,
  requestedEnd: number,
  playhead?: number,
  snapThreshold?: number,
): EditorCommand {
  return {
    id: id('trim-right'),
    label: '右トリム',
    coalesceKey: `clip:${clipId}:trim-right`,
    apply: (project) => trimClipRight(project, clipId, requestedEnd, playhead, snapThreshold),
  };
}

export function nudgeClipCommand(clipId: string, frames: number): EditorCommand {
  return {
    id: id('nudge'),
    label: 'クリップをフレーム移動',
    coalesceKey: `clip:${clipId}:nudge`,
    apply: (project) => nudgeClip(project, clipId, frames),
  };
}
