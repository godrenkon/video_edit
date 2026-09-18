import type { AssetMeta, Project } from '../types/editor';
import { addTrack } from './trackOps';
import { clampProjectDuration, defaultClip } from './project';

export interface PunchInVoiceoverResult {
  project: Project;
  clipId: string | null;
  trackId: string | null;
}

export function addPunchInVoiceover(
  project: Project,
  asset: AssetMeta,
  startTime: number,
): PunchInVoiceoverResult {
  if (asset.kind !== 'audio') return { project, clipId: null, trackId: null };

  let next: Project = project.assets.some((item) => item.id === asset.id)
    ? project
    : { ...project, assets: [...project.assets, asset] };

  let target = next.tracks.find((track) => (
    track.kind === 'audio'
      && !track.locked
      && track.busId === 'voice'
  ));

  if (!target) {
    const previousIds = new Set(next.tracks.map((track) => track.id));
    next = addTrack(next, 'audio', { name: 'ボイスオーバー' });
    target = next.tracks.find((track) => !previousIds.has(track.id)) ?? null ?? undefined;
    if (target) {
      const targetId = target.id;
      next = {
        ...next,
        tracks: next.tracks.map((track) => (
          track.id === targetId ? { ...track, busId: 'voice' as const } : track
        )),
      };
      target = next.tracks.find((track) => track.id === targetId);
    }
  }

  if (!target) return { project: next, clipId: null, trackId: null };

  const safeStart = Math.max(0, Math.min(
    Math.max(0, next.duration),
    Number.isFinite(startTime) ? startTime : 0,
  ));
  const duration = Math.max(0.1, asset.duration);
  const clip = defaultClip(asset.name, asset.id, safeStart, duration);
  const targetId = target.id;

  next = {
    ...next,
    tracks: next.tracks.map((track) => (
      track.id === targetId
        ? { ...track, clips: [...track.clips, clip] }
        : track
    )),
  };
  next = clampProjectDuration(next);

  return { project: next, clipId: clip.id, trackId: targetId };
}
