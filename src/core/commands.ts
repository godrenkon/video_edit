import type { Clip, Project } from '../types/editor';
import { rippleTrimClip, rollEditBoundary, slideEditClip, type TimelineEdge } from './advancedTimelineOps';
import { insertClipAt, overwriteClipAt, type InsertScope } from './editModes';
import { groupSelectedClips, ungroupSelectedClips } from './groupOps';
import { deleteSelectedClips, moveSelectedClipsByDelta, nudgeSelectedClips } from './multiSelectionOps';
import { uid } from './project';
import { moveClip, nudgeClip, rippleDeleteClip, splitClipAt, trimClipLeft, trimClipRight, type RippleDeleteScope } from './timelineOps';
import { moveClipToTrack } from './trackPlacement';

export type EditorCommandPayload =
  | { type: 'split-clip'; clipId: string; time: number }
  | { type: 'ripple-delete'; clipId: string; scope: RippleDeleteScope }
  | { type: 'move-clip'; clipId: string; start: number; playhead?: number; snapThreshold?: number }
  | { type: 'move-clip-to-track'; clipId: string; trackId: string; start: number; playhead?: number; snapThreshold?: number }
  | { type: 'trim-left'; clipId: string; start: number; playhead?: number; snapThreshold?: number }
  | { type: 'trim-right'; clipId: string; end: number; playhead?: number; snapThreshold?: number }
  | { type: 'ripple-trim'; clipId: string; edge: TimelineEdge; boundary: number; playhead?: number; snapThreshold?: number; scope: RippleDeleteScope }
  | { type: 'roll-edit'; clipId: string; edge: TimelineEdge; boundary: number }
  | { type: 'slide-edit'; clipId: string; start: number }
  | { type: 'nudge-clip'; clipId: string; frames: number }
  | { type: 'delete-clips'; clipIds: string[] }
  | { type: 'move-clips'; clipIds: string[]; delta: number }
  | { type: 'nudge-clips'; clipIds: string[]; frames: number }
  | { type: 'group-clips'; clipIds: string[]; groupId: string }
  | { type: 'ungroup-clips'; clipIds: string[] }
  | { type: 'insert-clip'; trackId: string; clip: Clip; time: number; scope: InsertScope }
  | { type: 'overwrite-clip'; trackId: string; clip: Clip; time: number };

export interface EditorCommand {
  id: string;
  label: string;
  coalesceKey?: string;
  payload: EditorCommandPayload;
  apply(project: Project): Project;
}

const id = (name: string) => `${name}:${crypto.randomUUID()}`;

function command(
  name: string,
  label: string,
  payload: EditorCommandPayload,
  coalesceKey?: string,
): EditorCommand {
  return {
    id: id(name),
    label,
    coalesceKey,
    payload,
    apply: (project) => applyEditorCommand(project, payload),
  };
}

/**
 * Pure command reducer used by UI execution, replay tests and future journals.
 * Payloads contain all edit inputs, so applying the same ordered payload list
 * to the same project snapshot produces the same timeline state.
 */
export function applyEditorCommand(project: Project, payload: EditorCommandPayload): Project {
  switch (payload.type) {
    case 'split-clip':
      return splitClipAt(project, payload.clipId, payload.time);
    case 'ripple-delete':
      return rippleDeleteClip(project, payload.clipId, payload.scope);
    case 'move-clip':
      return moveClip(project, payload.clipId, payload.start, payload.playhead, payload.snapThreshold);
    case 'move-clip-to-track':
      return moveClipToTrack(
        project,
        payload.clipId,
        payload.trackId,
        payload.start,
        payload.playhead,
        payload.snapThreshold,
      );
    case 'trim-left':
      return trimClipLeft(project, payload.clipId, payload.start, payload.playhead, payload.snapThreshold);
    case 'trim-right':
      return trimClipRight(project, payload.clipId, payload.end, payload.playhead, payload.snapThreshold);
    case 'ripple-trim':
      return rippleTrimClip(
        project,
        payload.clipId,
        payload.edge,
        payload.boundary,
        payload.playhead,
        payload.snapThreshold,
        payload.scope,
      );
    case 'roll-edit':
      return rollEditBoundary(project, payload.clipId, payload.edge, payload.boundary);
    case 'slide-edit':
      return slideEditClip(project, payload.clipId, payload.start);
    case 'nudge-clip':
      return nudgeClip(project, payload.clipId, payload.frames);
    case 'delete-clips':
      return deleteSelectedClips(project, payload.clipIds);
    case 'move-clips':
      return moveSelectedClipsByDelta(project, payload.clipIds, payload.delta);
    case 'nudge-clips':
      return nudgeSelectedClips(project, payload.clipIds, payload.frames);
    case 'group-clips':
      return groupSelectedClips(project, payload.clipIds, payload.groupId);
    case 'ungroup-clips':
      return ungroupSelectedClips(project, payload.clipIds);
    case 'insert-clip':
      return insertClipAt(project, payload.trackId, payload.clip, payload.time, payload.scope);
    case 'overwrite-clip':
      return overwriteClipAt(project, payload.trackId, payload.clip, payload.time);
  }
}

export function replayEditorCommands(project: Project, payloads: readonly EditorCommandPayload[]) {
  return payloads.reduce((current, payload) => applyEditorCommand(current, payload), project);
}

export function splitClipCommand(clipId: string, time: number): EditorCommand {
  return command('split', 'クリップ分割', { type: 'split-clip', clipId, time });
}

export function rippleDeleteCommand(
  clipId: string,
  scope: RippleDeleteScope | boolean = 'track',
): EditorCommand {
  const normalizedScope = typeof scope === 'boolean' ? (scope ? 'all' : 'track') : scope;
  return command('ripple-delete', 'リップル削除', {
    type: 'ripple-delete',
    clipId,
    scope: normalizedScope,
  });
}

export function moveClipCommand(
  clipId: string,
  start: number,
  playhead?: number,
  snapThreshold?: number,
): EditorCommand {
  return command(
    'move',
    'クリップ移動',
    { type: 'move-clip', clipId, start, playhead, snapThreshold },
    `clip:${clipId}:move`,
  );
}

export function moveClipToTrackCommand(
  clipId: string,
  trackId: string,
  start: number,
  playhead?: number,
  snapThreshold?: number,
): EditorCommand {
  return command(
    'move-track',
    'クリップを別トラックへ移動',
    { type: 'move-clip-to-track', clipId, trackId, start, playhead, snapThreshold },
    `clip:${clipId}:move-track`,
  );
}

export function trimLeftCommand(
  clipId: string,
  start: number,
  playhead?: number,
  snapThreshold?: number,
): EditorCommand {
  return command(
    'trim-left',
    '左トリム',
    { type: 'trim-left', clipId, start, playhead, snapThreshold },
    `clip:${clipId}:trim-left`,
  );
}

export function trimRightCommand(
  clipId: string,
  requestedEnd: number,
  playhead?: number,
  snapThreshold?: number,
): EditorCommand {
  return command(
    'trim-right',
    '右トリム',
    { type: 'trim-right', clipId, end: requestedEnd, playhead, snapThreshold },
    `clip:${clipId}:trim-right`,
  );
}

export function rippleTrimCommand(
  clipId: string,
  edge: TimelineEdge,
  boundary: number,
  playhead?: number,
  snapThreshold?: number,
  scope: RippleDeleteScope = 'sync-lock',
): EditorCommand {
  return command(
    'ripple-trim',
    'リップルトリム',
    { type: 'ripple-trim', clipId, edge, boundary, playhead, snapThreshold, scope },
    `clip:${clipId}:ripple-trim:${edge}`,
  );
}

export function rollEditCommand(clipId: string, edge: TimelineEdge, boundary: number): EditorCommand {
  return command(
    'roll-edit',
    'ロール編集',
    { type: 'roll-edit', clipId, edge, boundary },
    `clip:${clipId}:roll:${edge}`,
  );
}

export function slideEditCommand(clipId: string, start: number): EditorCommand {
  return command(
    'slide-edit',
    'スライド編集',
    { type: 'slide-edit', clipId, start },
    `clip:${clipId}:slide`,
  );
}

export function nudgeClipCommand(clipId: string, frames: number): EditorCommand {
  return command(
    'nudge',
    'クリップをフレーム移動',
    { type: 'nudge-clip', clipId, frames },
    `clip:${clipId}:nudge`,
  );
}

export function deleteClipsCommand(clipIds: Iterable<string>): EditorCommand {
  const ids = normalizedIds(clipIds);
  return command('delete-clips', ids.length > 1 ? `${ids.length}クリップ削除` : 'クリップ削除', {
    type: 'delete-clips',
    clipIds: ids,
  });
}

export function moveClipsCommand(clipIds: Iterable<string>, delta: number): EditorCommand {
  const ids = normalizedIds(clipIds);
  return command(
    'move-clips',
    '選択クリップ移動',
    { type: 'move-clips', clipIds: ids, delta },
    `multi:move:${stableIds(ids)}`,
  );
}

export function nudgeClipsCommand(clipIds: Iterable<string>, frames: number): EditorCommand {
  const ids = normalizedIds(clipIds);
  return command(
    'nudge-clips',
    '選択クリップをフレーム移動',
    { type: 'nudge-clips', clipIds: ids, frames },
    `multi:nudge:${stableIds(ids)}`,
  );
}

export function groupClipsCommand(clipIds: Iterable<string>, groupId = uid('group')): EditorCommand {
  const ids = normalizedIds(clipIds);
  return command('group-clips', 'クリップをグループ化', {
    type: 'group-clips',
    clipIds: ids,
    groupId,
  });
}

export function ungroupClipsCommand(clipIds: Iterable<string>): EditorCommand {
  return command('ungroup-clips', 'グループを解除', {
    type: 'ungroup-clips',
    clipIds: normalizedIds(clipIds),
  });
}

export function insertClipCommand(
  trackId: string,
  clip: Clip,
  time: number,
  scope: InsertScope = 'sync-lock',
): EditorCommand {
  return command('insert', '挿入編集', {
    type: 'insert-clip',
    trackId,
    clip: structuredClone(clip),
    time,
    scope,
  });
}

export function overwriteClipCommand(trackId: string, clip: Clip, time: number): EditorCommand {
  return command('overwrite', '上書き編集', {
    type: 'overwrite-clip',
    trackId,
    clip: structuredClone(clip),
    time,
  });
}

function normalizedIds(clipIds: Iterable<string>) {
  return [...new Set(clipIds)].filter(Boolean);
}

function stableIds(clipIds: readonly string[]) {
  return [...clipIds].sort((a, b) => a.localeCompare(b)).join(',');
}
