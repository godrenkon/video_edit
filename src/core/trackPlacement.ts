import type { Clip, Project, Track } from '../types/editor';
import { findClip, snapTime } from './timelineOps';

export function clipCanLiveOnTrack(project: Project, clip: Clip, track: Track): boolean {
  if (track.kind === 'subtitle') return clip.kind === 'subtitle';
  if (clip.kind === 'subtitle') return false;

  if (track.kind === 'audio') {
    if (clip.kind !== 'asset' || !clip.assetId) return false;
    return project.assets.find((asset) => asset.id === clip.assetId)?.kind === 'audio';
  }

  if (track.kind !== 'video' && track.kind !== 'overlay') return false;
  if (clip.kind !== 'asset') return true;
  if (!clip.assetId) return true;
  return project.assets.find((asset) => asset.id === clip.assetId)?.kind !== 'audio';
}

export function moveClipToTrack(
  project: Project,
  clipId: string,
  targetTrackId: string,
  requestedStart: number,
  playhead?: number,
  thresholdSeconds = 0.12,
): Project {
  const source = findClip(project, clipId);
  const target = project.tracks.find((track) => track.id === targetTrackId);
  if (!source || !target || source.track.locked || target.locked) return project;
  if (!clipCanLiveOnTrack(project, source.clip, target)) return project;

  const start = snapTime(project, Math.max(0, requestedStart), clipId, playhead, thresholdSeconds);
  if (source.track.id === target.id) {
    if (Math.abs(source.clip.start - start) <= Number.EPSILON) return project;
    return {
      ...project,
      tracks: project.tracks.map((track) => track.id === source.track.id
        ? { ...track, clips: track.clips.map((clip) => clip.id === clipId ? { ...clip, start } : clip) }
        : track),
    };
  }

  const moved = { ...source.clip, start };
  return {
    ...project,
    tracks: project.tracks.map((track) => {
      if (track.id === source.track.id) return { ...track, clips: track.clips.filter((clip) => clip.id !== clipId) };
      if (track.id === target.id) return { ...track, clips: [...track.clips, moved] };
      return track;
    }),
  };
}
