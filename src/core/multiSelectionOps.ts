import type { Project } from '../types/editor';

export function existingClipIds(project: Project, clipIds: Iterable<string>) {
  const requested = new Set(clipIds);
  const result: string[] = [];
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (requested.has(clip.id)) result.push(clip.id);
    }
  }
  return result;
}

export function deleteSelectedClips(project: Project, clipIds: Iterable<string>): Project {
  const selected = new Set(clipIds);
  if (selected.size === 0) return project;

  let changed = false;
  const tracks = project.tracks.map((track) => {
    if (track.locked) return track;
    const clips = track.clips.filter((clip) => !selected.has(clip.id));
    if (clips.length === track.clips.length) return track;
    changed = true;
    return { ...track, clips };
  });
  return changed ? { ...project, tracks } : project;
}

export function moveSelectedClipsByDelta(
  project: Project,
  clipIds: Iterable<string>,
  requestedDeltaSeconds: number,
): Project {
  const selected = new Set(clipIds);
  if (selected.size === 0 || !Number.isFinite(requestedDeltaSeconds)) return project;

  const editable = project.tracks.flatMap((track) => track.locked
    ? []
    : track.clips.filter((clip) => selected.has(clip.id)));
  if (editable.length === 0) return project;

  const fps = Math.max(1, project.fps || 30);
  const frame = 1 / fps;
  const quantizedDelta = Math.round(requestedDeltaSeconds / frame) * frame;
  const minimumStart = Math.min(...editable.map((clip) => clip.start));
  const delta = Math.max(-minimumStart, quantizedDelta);
  if (Math.abs(delta) < frame / 1000) return project;

  return {
    ...project,
    tracks: project.tracks.map((track) => {
      if (track.locked) return track;
      let changed = false;
      const clips = track.clips.map((clip) => {
        if (!selected.has(clip.id)) return clip;
        changed = true;
        return { ...clip, start: quantize(Math.max(0, clip.start + delta), fps) };
      });
      return changed ? { ...track, clips } : track;
    }),
  };
}

export function nudgeSelectedClips(project: Project, clipIds: Iterable<string>, frames: number): Project {
  if (!Number.isFinite(frames) || frames === 0) return project;
  return moveSelectedClipsByDelta(project, clipIds, Math.round(frames) / Math.max(1, project.fps || 30));
}

function quantize(value: number, fps: number) {
  return Math.max(0, Math.round(value * fps) / fps);
}
