import type { Project, Track, TrackKind } from '../types/editor';
import { uid } from './project';

export interface AddTrackOptions {
  name?: string;
  index?: number;
}

export interface RemoveTrackResult {
  project: Project;
  removed: boolean;
  reason?: 'not-found' | 'not-empty' | 'last-of-kind';
}

export function addTrack(project: Project, kind: TrackKind, options: AddTrackOptions = {}): Project {
  const track: Track = {
    id: uid('track'),
    name: options.name?.trim() || nextTrackName(project, kind),
    kind,
    muted: false,
    locked: false,
    visible: true,
    clips: [],
  };
  const fallbackIndex = insertionIndexForKind(project, kind);
  const index = clampIndex(options.index ?? fallbackIndex, project.tracks.length);
  const tracks = project.tracks.slice();
  tracks.splice(index, 0, track);
  return { ...project, tracks };
}

export function renameTrack(project: Project, trackId: string, name: string): Project {
  const trimmed = name.trim();
  if (!trimmed) return project;
  let changed = false;
  const tracks = project.tracks.map((track) => {
    if (track.id !== trackId || track.name === trimmed) return track;
    changed = true;
    return { ...track, name: trimmed };
  });
  return changed ? { ...project, tracks } : project;
}

export function moveTrack(project: Project, trackId: string, direction: -1 | 1): Project {
  const index = project.tracks.findIndex((track) => track.id === trackId);
  if (index < 0) return project;
  const target = index + direction;
  if (target < 0 || target >= project.tracks.length) return project;
  const tracks = project.tracks.slice();
  [tracks[index], tracks[target]] = [tracks[target], tracks[index]];
  return { ...project, tracks };
}

export function canRemoveTrack(project: Project, trackId: string) {
  const track = project.tracks.find((item) => item.id === trackId);
  if (!track) return { allowed: false as const, reason: 'not-found' as const };
  if (track.clips.length > 0) return { allowed: false as const, reason: 'not-empty' as const };
  const sameKindCount = project.tracks.filter((item) => item.kind === track.kind).length;
  if (sameKindCount <= 1) return { allowed: false as const, reason: 'last-of-kind' as const };
  return { allowed: true as const };
}

export function removeTrack(project: Project, trackId: string): RemoveTrackResult {
  const permission = canRemoveTrack(project, trackId);
  if (!permission.allowed) return { project, removed: false, reason: permission.reason };
  return {
    project: { ...project, tracks: project.tracks.filter((track) => track.id !== trackId) },
    removed: true,
  };
}

export function setTrackSolo(project: Project, trackId: string, solo: boolean): Project {
  let changed = false;
  const tracks = project.tracks.map((track) => {
    if (track.id !== trackId || Boolean(track.solo) === solo) return track;
    changed = true;
    return { ...track, solo };
  });
  return changed ? { ...project, tracks } : project;
}

export function setTrackVisible(project: Project, trackId: string, visible: boolean): Project {
  let changed = false;
  const tracks = project.tracks.map((track) => {
    if (track.id !== trackId || (track.visible !== false) === visible) return track;
    changed = true;
    return { ...track, visible };
  });
  return changed ? { ...project, tracks } : project;
}

function nextTrackName(project: Project, kind: TrackKind) {
  const base = trackKindLabel(kind);
  const used = new Set(project.tracks.filter((track) => track.kind === kind).map((track) => track.name));
  let number = 1;
  while (used.has(`${base} ${number}`)) number += 1;
  return `${base} ${number}`;
}

function insertionIndexForKind(project: Project, kind: TrackKind) {
  let lastMatch = -1;
  project.tracks.forEach((track, index) => {
    if (track.kind === kind) lastMatch = index;
  });
  return lastMatch >= 0 ? lastMatch + 1 : project.tracks.length;
}

function trackKindLabel(kind: TrackKind) {
  if (kind === 'video') return 'ビデオ';
  if (kind === 'audio') return 'オーディオ';
  if (kind === 'subtitle') return '字幕';
  return 'オーバーレイ';
}

function clampIndex(index: number, length: number) {
  if (!Number.isFinite(index)) return length;
  return Math.max(0, Math.min(length, Math.round(index)));
}
