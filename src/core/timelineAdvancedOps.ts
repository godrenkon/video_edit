import type { Project } from '../types/editor';
import { findClip, quantizeToFrame, trimClipLeft, trimClipRight } from './timelineOps';

/**
 * Trims the right edge and moves later clips by the exact duration delta so the
 * old gap/overlap relationship remains ripple-consistent.
 */
export function rippleTrimClipRight(
  project: Project,
  clipId: string,
  requestedEnd: number,
  playhead?: number,
  thresholdSeconds = 0.12,
): Project {
  const before = findClip(project, clipId);
  if (!before || before.track.locked) return project;

  const oldEnd = before.clip.start + before.clip.duration;
  const trimmed = trimClipRight(project, clipId, requestedEnd, playhead, thresholdSeconds);
  if (trimmed === project) return project;

  const after = findClip(trimmed, clipId);
  if (!after) return project;
  const newEnd = after.clip.start + after.clip.duration;
  const delta = newEnd - oldEnd;
  if (Math.abs(delta) <= 1e-9) return trimmed;

  return {
    ...trimmed,
    tracks: trimmed.tracks.map((track, trackIndex) => {
      if (trackIndex !== before.trackIndex) return track;
      return {
        ...track,
        clips: track.clips.map((clip) => {
          if (clip.id === clipId || clip.start < oldEnd - 1e-9) return clip;
          return { ...clip, start: Math.max(newEnd, clip.start + delta) };
        }),
      };
    }),
  };
}

/**
 * Moves the shared boundary between two clips without changing the combined
 * timeline span. Source in-points, local subtitle timings and effect keyframes
 * are preserved by the normal left/right trim primitives.
 */
export function rollEditBoundary(
  project: Project,
  leftClipId: string,
  rightClipId: string,
  requestedBoundary: number,
): Project {
  if (leftClipId === rightClipId) return project;
  const left = findClip(project, leftClipId);
  const right = findClip(project, rightClipId);
  if (!left || !right) return project;
  if (left.trackIndex !== right.trackIndex || left.track.locked) return project;

  const frame = 1 / Math.max(1, project.fps);
  const rightEnd = right.clip.start + right.clip.duration;
  const minimumBoundary = left.clip.start + frame;
  const maximumBoundary = rightEnd - frame;
  if (maximumBoundary < minimumBoundary) return project;

  const boundary = Math.max(
    minimumBoundary,
    Math.min(maximumBoundary, quantizeToFrame(requestedBoundary, project.fps)),
  );

  let next = trimClipRight(project, leftClipId, boundary, undefined, 0);
  const leftAfter = findClip(next, leftClipId);
  if (!leftAfter) return project;
  const actualBoundary = leftAfter.clip.start + leftAfter.clip.duration;

  next = trimClipLeft(next, rightClipId, actualBoundary, undefined, 0);
  const finalLeft = findClip(next, leftClipId);
  const finalRight = findClip(next, rightClipId);
  if (!finalLeft || !finalRight) return project;

  const finalBoundary = finalLeft.clip.start + finalLeft.clip.duration;
  const tolerance = frame / 1000;
  if (Math.abs(finalBoundary - finalRight.clip.start) > tolerance) return project;
  if (Math.abs((finalRight.clip.start + finalRight.clip.duration) - rightEnd) > tolerance) return project;

  return next;
}
