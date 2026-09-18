import type { Clip, Project } from '../types/editor';
import { findClip, quantizeToFrame, splitClipAt } from './timelineOps';

export function insertClipAt(
  project: Project,
  trackId: string,
  incoming: Clip,
  timeSeconds: number,
): Project {
  const track = project.tracks.find((item) => item.id === trackId);
  if (!track || track.locked) return project;

  const time = quantizeToFrame(Math.max(0, timeSeconds), project.fps);
  let next = splitTrackAt(project, trackId, time);
  const duration = quantizeDuration(incoming.duration, project.fps);

  next = {
    ...next,
    tracks: next.tracks.map((item) => item.id === trackId
      ? {
          ...item,
          clips: [
            ...item.clips.map((clip) => clip.start >= time - frameTolerance(project)
              ? { ...clip, start: quantizeToFrame(clip.start + duration, project.fps) }
              : clip),
            { ...incoming, start: time, duration },
          ],
        }
      : item),
  };
  return next;
}

export function overwriteClipAt(
  project: Project,
  trackId: string,
  incoming: Clip,
  timeSeconds: number,
): Project {
  const track = project.tracks.find((item) => item.id === trackId);
  if (!track || track.locked) return project;

  const start = quantizeToFrame(Math.max(0, timeSeconds), project.fps);
  const duration = quantizeDuration(incoming.duration, project.fps);
  const end = quantizeToFrame(start + duration, project.fps);

  let next = splitTrackAt(project, trackId, start);
  next = splitTrackAt(next, trackId, end);

  next = {
    ...next,
    tracks: next.tracks.map((item) => item.id === trackId
      ? {
          ...item,
          clips: [
            ...item.clips.filter((clip) => !isInsideRange(clip, start, end, project)),
            { ...incoming, start, duration },
          ],
        }
      : item),
  };
  return next;
}

function splitTrackAt(project: Project, trackId: string, time: number) {
  let next = project;
  const track = next.tracks.find((item) => item.id === trackId);
  if (!track) return next;

  const crossingIds = track.clips
    .filter((clip) => clip.start < time - frameTolerance(project)
      && clip.start + clip.duration > time + frameTolerance(project))
    .map((clip) => clip.id);

  for (const clipId of crossingIds) {
    const current = findClip(next, clipId);
    if (!current || current.track.id !== trackId) continue;
    next = splitClipAt(next, clipId, time);
  }
  return next;
}

function isInsideRange(clip: Clip, start: number, end: number, project: Project) {
  const tolerance = frameTolerance(project);
  return clip.start >= start - tolerance
    && clip.start + clip.duration <= end + tolerance;
}

function quantizeDuration(duration: number, fps: number) {
  const frame = 1 / Math.max(1, fps);
  return Math.max(frame, Math.round(Math.max(frame, duration) * Math.max(1, fps)) / Math.max(1, fps));
}

function frameTolerance(project: Project) {
  return 1 / Math.max(1, project.fps) / 1000;
}
