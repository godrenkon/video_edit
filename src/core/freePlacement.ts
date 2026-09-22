import { uid } from './project';
import type { Clip, Project, Track, TrackKind } from '../types/editor';

const OVERLAP_EPSILON = 0.0001;

export function placeClipOnAvailableTrack(
  project: Project,
  clip: Clip,
  kind: TrackKind,
  preferredTrackId?: string | null,
): Project {
  const overlaps = (candidate: Clip) => {
    const candidateEnd = candidate.start + candidate.duration;
    const clipEnd = clip.start + clip.duration;
    return candidate.start < clipEnd - OVERLAP_EPSILON
      && candidateEnd > clip.start + OVERLAP_EPSILON;
  };

  const preferred = preferredTrackId
    ? project.tracks.find((track) => (
        track.id === preferredTrackId
        && track.kind === kind
        && !track.locked
        && !track.clips.some(overlaps)
      ))
    : undefined;

  const free = preferred ?? project.tracks.find((track) => (
    track.kind === kind
    && !track.locked
    && !track.clips.some(overlaps)
  ));

  if (free) {
    return {
      ...project,
      tracks: project.tracks.map((track) => (
        track.id === free.id
          ? { ...track, clips: [...track.clips, clip] }
          : track
      )),
    };
  }

  const sameKindCount = project.tracks.filter((track) => track.kind === kind).length;
  const created: Track = {
    id: uid('track'),
    name: `${trackKindLabel(kind)} ${sameKindCount + 1}`,
    kind,
    muted: false,
    locked: false,
    syncLock: true,
    visible: true,
    clips: [clip],
  };

  const firstSameKind = project.tracks.findIndex((track) => track.kind === kind);
  if (firstSameKind < 0) return { ...project, tracks: [...project.tracks, created] };

  return {
    ...project,
    tracks: [
      ...project.tracks.slice(0, firstSameKind),
      created,
      ...project.tracks.slice(firstSameKind),
    ],
  };
}

function trackKindLabel(kind: TrackKind) {
  if (kind === 'video') return 'ビデオ';
  if (kind === 'audio') return 'オーディオ';
  if (kind === 'subtitle') return '字幕';
  return 'オーバーレイ';
}
