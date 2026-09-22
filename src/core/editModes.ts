import type { Clip, Project } from '../types/editor';
import { frameDuration } from './timebase';
import { findClip, quantizeToFrame, splitClipAt } from './timelineOps';

export type InsertScope = 'track' | 'sync-lock' | 'all';

export function insertClipAt(
  project: Project,
  trackId: string,
  incoming: Clip,
  timeSeconds: number,
  scope: InsertScope = 'track',
): Project {
  const target = project.tracks.find((item) => item.id === trackId);
  if (!target || target.locked) return project;

  const time = quantizeToFrame(Math.max(0, timeSeconds), project.fps);
  const duration = quantizeDuration(incoming.duration, project.fps);
  const affectedTrackIds = new Set(
    project.tracks
      .filter((track) => {
        if (track.locked) return false;
        if (track.id === trackId) return true;
        if (scope === 'all') return true;
        return scope === 'sync-lock' && track.syncLock !== false;
      })
      .map((track) => track.id),
  );

  let next = splitTracksAt(project, affectedTrackIds, time);
  next = {
    ...next,
    tracks: next.tracks.map((track) => {
      if (!affectedTrackIds.has(track.id)) return track;
      const clips = track.clips.map((clip) => clip.start >= time - frameTolerance(project)
        ? { ...clip, start: quantizeToFrame(clip.start + duration, project.fps) }
        : clip);
      if (track.id === trackId) clips.push({ ...incoming, start: time, duration });
      return { ...track, clips };
    }),
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

  let next = splitTracksAt(project, new Set([trackId]), start);
  next = splitTracksAt(next, new Set([trackId]), end);

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

function splitTracksAt(project: Project, trackIds: Set<string>, time: number) {
  let next = project;
  for (const trackId of trackIds) {
    const track = next.tracks.find((item) => item.id === trackId);
    if (!track || track.locked) continue;

    const crossingIds = track.clips
      .filter((clip) => clip.start < time - frameTolerance(project)
        && clip.start + clip.duration > time + frameTolerance(project))
      .map((clip) => clip.id);

    for (const clipId of crossingIds) {
      const current = findClip(next, clipId);
      if (!current || current.track.id !== trackId) continue;
      next = splitClipAt(next, clipId, time);
    }
  }
  return next;
}

function isInsideRange(clip: Clip, start: number, end: number, project: Project) {
  const tolerance = frameTolerance(project);
  return clip.start >= start - tolerance
    && clip.start + clip.duration <= end + tolerance;
}

function quantizeDuration(duration: number, fps: number) {
  const frame = frameDuration(fps);
  return Math.max(frame, quantizeToFrame(Math.max(frame, duration), fps));
}

function frameTolerance(project: Project) {
  return frameDuration(project.fps) / 1000;
}
