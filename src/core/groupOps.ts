import type { Project } from '../types/editor';
import { uid } from './project';

export function groupSelectedClips(project: Project, clipIds: Iterable<string>) {
  const selected = new Set(clipIds);
  if (selected.size < 2) return project;
  const editableIds = new Set(
    project.tracks.flatMap((track) => track.locked ? [] : track.clips.filter((clip) => selected.has(clip.id)).map((clip) => clip.id)),
  );
  if (editableIds.size < 2) return project;

  const groupId = uid('group');
  let changed = false;
  const tracks = project.tracks.map((track) => {
    if (track.locked) return track;
    const clips = track.clips.map((clip) => {
      if (!editableIds.has(clip.id)) return clip;
      changed = true;
      return { ...clip, groupId };
    });
    return changed ? { ...track, clips } : track;
  });
  return changed ? { ...project, tracks } : project;
}

export function ungroupSelectedClips(project: Project, clipIds: Iterable<string>) {
  const selected = new Set(clipIds);
  if (selected.size === 0) return project;
  const groupIds = new Set<string>();

  for (const track of project.tracks) {
    if (track.locked) continue;
    for (const clip of track.clips) {
      if (selected.has(clip.id) && clip.groupId) groupIds.add(clip.groupId);
    }
  }
  if (groupIds.size === 0) return project;

  let changed = false;
  const tracks = project.tracks.map((track) => {
    if (track.locked) return track;
    const clips = track.clips.map((clip) => {
      if (!clip.groupId || !groupIds.has(clip.groupId)) return clip;
      changed = true;
      const { groupId: _groupId, ...rest } = clip;
      return rest;
    });
    return changed ? { ...track, clips } : track;
  });
  return changed ? { ...project, tracks } : project;
}

export function groupClipIds(project: Project, clipId: string) {
  let groupId: string | undefined;
  for (const track of project.tracks) {
    const clip = track.clips.find((item) => item.id === clipId);
    if (clip) {
      groupId = clip.groupId;
      break;
    }
  }
  if (!groupId) return [clipId];

  const ids: string[] = [];
  for (const track of project.tracks) {
    if (track.locked) continue;
    for (const clip of track.clips) {
      if (clip.groupId === groupId) ids.push(clip.id);
    }
  }
  return ids.length ? ids : [clipId];
}

export function selectedHasGroup(project: Project, clipIds: Iterable<string>) {
  const selected = new Set(clipIds);
  return project.tracks.some((track) => track.clips.some((clip) => selected.has(clip.id) && Boolean(clip.groupId)));
}
