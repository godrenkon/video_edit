import type { Project } from '../types/editor';
import {
  findClip,
  quantizeToFrame,
  trimClipLeft,
  trimClipRight,
} from './timelineOps';

export type TimelineEdge = 'left' | 'right';

/**
 * Ripple-trims one clip while preserving the edit point on the opposite side.
 * Downstream clips on the same track are shifted by the timeline duration delta.
 */
export function rippleTrimClip(
  project: Project,
  clipId: string,
  edge: TimelineEdge,
  requestedBoundary: number,
  playhead?: number,
  thresholdSeconds = 0.12,
): Project {
  const location = findClip(project, clipId);
  if (!location || location.track.locked) return project;

  const original = location.clip;
  const originalStart = original.start;
  const originalEnd = original.start + original.duration;
  const trimmed = edge === 'left'
    ? trimClipLeft(project, clipId, requestedBoundary, playhead, thresholdSeconds)
    : trimClipRight(project, clipId, requestedBoundary, playhead, thresholdSeconds);
  if (trimmed === project) return project;

  const afterTrim = findClip(trimmed, clipId);
  if (!afterTrim) return project;
  const frame = 1 / Math.max(1, project.fps);

  if (edge === 'left') {
    const trimDelta = afterTrim.clip.start - originalStart;
    if (Math.abs(trimDelta) < frame / 1000) return trimmed;
    return {
      ...trimmed,
      tracks: trimmed.tracks.map((track, index) => {
        if (index !== location.trackIndex) return track;
        return {
          ...track,
          clips: track.clips.map((clip) => {
            const originalClip = location.track.clips.find((item) => item.id === clip.id);
            if (!originalClip || originalClip.start + frame / 2 < originalStart) return clip;
            return { ...clip, start: quantizeToFrame(Math.max(0, clip.start - trimDelta), project.fps) };
          }),
        };
      }),
    };
  }

  const nextEnd = afterTrim.clip.start + afterTrim.clip.duration;
  const durationDelta = nextEnd - originalEnd;
  if (Math.abs(durationDelta) < frame / 1000) return trimmed;
  return {
    ...trimmed,
    tracks: trimmed.tracks.map((track, index) => {
      if (index !== location.trackIndex) return track;
      return {
        ...track,
        clips: track.clips.map((clip) => {
          if (clip.id === clipId) return clip;
          const originalClip = location.track.clips.find((item) => item.id === clip.id);
          if (!originalClip || originalClip.start < originalEnd - frame / 2) return clip;
          return { ...clip, start: quantizeToFrame(Math.max(0, clip.start + durationDelta), project.fps) };
        }),
      };
    }),
  };
}

/**
 * Moves a cut between two directly adjacent clips. The outer start/end of the
 * pair stay fixed while source in-points, durations and local keyframes are
 * adjusted through the normal trim operations.
 */
export function rollEditBoundary(
  project: Project,
  clipId: string,
  edge: TimelineEdge,
  requestedBoundary: number,
): Project {
  const location = findClip(project, clipId);
  if (!location || location.track.locked) return project;

  const pair = adjacentPair(project, clipId, edge);
  if (!pair) return project;

  const requested = quantizeToFrame(requestedBoundary, project.fps);
  let next = trimClipRight(project, pair.leftId, requested, undefined, 0);
  const left = findClip(next, pair.leftId);
  if (!left) return project;
  let boundary = left.clip.start + left.clip.duration;

  next = trimClipLeft(next, pair.rightId, boundary, undefined, 0);
  const right = findClip(next, pair.rightId);
  if (!right) return project;

  const frame = 1 / Math.max(1, project.fps);
  if (Math.abs(right.clip.start - boundary) > frame / 1000) {
    boundary = right.clip.start;
    next = trimClipRight(next, pair.leftId, boundary, undefined, 0);
  }

  const finalLeft = findClip(next, pair.leftId);
  const finalRight = findClip(next, pair.rightId);
  if (!finalLeft || !finalRight) return project;
  if (Math.abs(finalLeft.clip.start + finalLeft.clip.duration - finalRight.clip.start) > frame / 1000) return project;
  return next;
}

export function adjacentPair(project: Project, clipId: string, edge: TimelineEdge) {
  const location = findClip(project, clipId);
  if (!location) return null;
  const frame = 1 / Math.max(1, project.fps);
  const clips = [...location.track.clips].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  const index = clips.findIndex((clip) => clip.id === clipId);
  if (index < 0) return null;

  const left = edge === 'right' ? clips[index] : clips[index - 1];
  const right = edge === 'right' ? clips[index + 1] : clips[index];
  if (!left || !right) return null;
  const boundary = left.start + left.duration;
  if (Math.abs(boundary - right.start) > frame / 2 + Number.EPSILON) return null;
  return { leftId: left.id, rightId: right.id, boundary };
}
