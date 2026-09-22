import type { Project } from '../types/editor';
import {
  findClip,
  quantizeToFrame,
  splitClipAt,
  trimClipLeft,
  trimClipRight,
  type RippleDeleteScope,
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
  scope: RippleDeleteScope = 'track',
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
  const affectedTrackIds = rippleAffectedTrackIds(project, location.track.id, scope);

  if (edge === 'left') {
    const trimDelta = afterTrim.clip.start - originalStart;
    if (Math.abs(trimDelta) < frame / 1000) return trimmed;
    const prepared = splitOtherRippleTracksAt(trimmed, affectedTrackIds, location.track.id, originalStart);
    return shiftRippleTracks(
      prepared,
      affectedTrackIds,
      clipId,
      originalStart,
      -trimDelta,
      'left',
    );
  }

  const nextEnd = afterTrim.clip.start + afterTrim.clip.duration;
  const durationDelta = nextEnd - originalEnd;
  if (Math.abs(durationDelta) < frame / 1000) return trimmed;
  const prepared = splitOtherRippleTracksAt(trimmed, affectedTrackIds, location.track.id, originalEnd);
  return shiftRippleTracks(
    prepared,
    affectedTrackIds,
    clipId,
    originalEnd,
    durationDelta,
    'right',
  );

}

function rippleAffectedTrackIds(project: Project, sourceTrackId: string, scope: RippleDeleteScope) {
  return new Set(project.tracks
    .filter((track) => {
      if (track.locked) return false;
      if (track.id === sourceTrackId) return true;
      if (scope === 'all') return true;
      return scope === 'sync-lock' && track.syncLock !== false;
    })
    .map((track) => track.id));
}

function splitOtherRippleTracksAt(
  project: Project,
  affectedTrackIds: Set<string>,
  sourceTrackId: string,
  boundary: number,
) {
  let next = project;
  const frame = 1 / Math.max(1, project.fps);
  for (const trackId of affectedTrackIds) {
    if (trackId === sourceTrackId) continue;
    const track = next.tracks.find((item) => item.id === trackId);
    if (!track || track.locked) continue;
    const crossing = track.clips
      .filter((clip) => clip.start < boundary - frame / 1000
        && clip.start + clip.duration > boundary + frame / 1000)
      .map((clip) => clip.id);
    for (const crossingClipId of crossing) {
      next = splitClipAt(next, crossingClipId, boundary);
    }
  }
  return next;
}

function shiftRippleTracks(
  project: Project,
  affectedTrackIds: Set<string>,
  editedClipId: string,
  boundary: number,
  delta: number,
  edge: TimelineEdge,
) {
  const frame = 1 / Math.max(1, project.fps);
  return {
    ...project,
    tracks: project.tracks.map((track) => {
      if (!affectedTrackIds.has(track.id) || track.locked) return track;
      return {
        ...track,
        clips: track.clips.map((clip) => {
          if (edge === 'right' && clip.id === editedClipId) return clip;
          if (clip.start < boundary - frame / 2) return clip;
          return { ...clip, start: quantizeToFrame(Math.max(0, clip.start + delta), project.fps) };
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


/**
 * Slides a clip between directly adjacent neighbours. The selected clip keeps
 * its duration and source range; the previous clip's out-point and next clip's
 * in-point absorb the movement so the outer three-clip span stays fixed.
 */
export function slideEditClip(
  project: Project,
  clipId: string,
  requestedStart: number,
): Project {
  const location = findClip(project, clipId);
  if (!location || location.track.locked) return project;

  const triplet = adjacentTriplet(project, clipId);
  if (!triplet) return project;

  const selectedDuration = location.clip.duration;
  const frame = 1 / Math.max(1, project.fps);
  const outerStart = triplet.left.start;
  const outerEnd = triplet.right.start + triplet.right.duration;
  const minimumStart = outerStart + frame;
  const maximumStart = outerEnd - selectedDuration - frame;
  if (maximumStart < minimumStart) return project;

  let desiredStart = quantizeToFrame(
    Math.max(minimumStart, Math.min(maximumStart, requestedStart)),
    project.fps,
  );

  let next = trimClipRight(project, triplet.left.id, desiredStart, undefined, 0);
  const leftAfter = findClip(next, triplet.left.id);
  if (!leftAfter) return project;
  desiredStart = leftAfter.clip.start + leftAfter.clip.duration;

  let desiredEnd = desiredStart + selectedDuration;
  next = trimClipLeft(next, triplet.right.id, desiredEnd, undefined, 0);
  const rightAfter = findClip(next, triplet.right.id);
  if (!rightAfter) return project;

  if (Math.abs(rightAfter.clip.start - desiredEnd) > frame / 1000) {
    desiredEnd = rightAfter.clip.start;
    desiredStart = desiredEnd - selectedDuration;
    next = trimClipRight(next, triplet.left.id, desiredStart, undefined, 0);
  }

  const finalLeft = findClip(next, triplet.left.id);
  const finalRight = findClip(next, triplet.right.id);
  if (!finalLeft || !finalRight) return project;
  const finalStart = finalLeft.clip.start + finalLeft.clip.duration;
  const finalEnd = finalStart + selectedDuration;
  if (Math.abs(finalRight.clip.start - finalEnd) > frame / 1000) return project;

  next = {
    ...next,
    tracks: next.tracks.map((track, index) => index === location.trackIndex
      ? {
          ...track,
          clips: track.clips.map((clip) => clip.id === clipId
            ? { ...clip, start: quantizeToFrame(finalStart, project.fps) }
            : clip),
        }
      : track),
  };

  const selectedAfter = findClip(next, clipId);
  const rightFinal = findClip(next, triplet.right.id);
  if (!selectedAfter || !rightFinal) return project;
  if (Math.abs(selectedAfter.clip.start + selectedAfter.clip.duration - rightFinal.clip.start) > frame / 1000) {
    return project;
  }
  return next;
}

export function adjacentTriplet(project: Project, clipId: string) {
  const location = findClip(project, clipId);
  if (!location) return null;
  const frame = 1 / Math.max(1, project.fps);
  const clips = [...location.track.clips].sort((a, b) => a.start - b.start || a.id.localeCompare(b.id));
  const index = clips.findIndex((clip) => clip.id === clipId);
  const left = clips[index - 1];
  const center = clips[index];
  const right = clips[index + 1];
  if (!left || !center || !right) return null;
  if (Math.abs(left.start + left.duration - center.start) > frame / 2 + Number.EPSILON) return null;
  if (Math.abs(center.start + center.duration - right.start) > frame / 2 + Number.EPSILON) return null;
  return { left, center, right };
}
