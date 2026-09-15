import type { AssetKind, Clip, Project, TrackKind } from '../types/editor';

export const uid = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

export function createProject(): Project {
  const now = new Date().toISOString();
  return {
    version: 2,
    id: uid('project'),
    name: '無題のプロジェクト',
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#000000',
    duration: 30,
    createdAt: now,
    updatedAt: now,
    assets: [],
    markers: [],
    tracks: [
      { id: uid('track'), name: 'オーバーレイ', kind: 'overlay', muted: false, locked: false, visible: true, clips: [] },
      { id: uid('track'), name: '字幕', kind: 'subtitle', muted: false, locked: false, visible: true, clips: [] },
      { id: uid('track'), name: 'ビデオ 1', kind: 'video', muted: false, locked: false, visible: true, clips: [] },
      { id: uid('track'), name: 'オーディオ 1', kind: 'audio', muted: false, locked: false, visible: true, clips: [] },
    ],
  };
}

export function trackKindForAsset(kind: AssetKind): TrackKind {
  if (kind === 'audio') return 'audio';
  if (kind === 'image') return 'overlay';
  return 'video';
}

export function defaultClip(name: string, assetId: string, start: number, duration: number): Clip {
  return {
    id: uid('clip'),
    kind: 'asset',
    name,
    assetId,
    start,
    duration: Math.max(0.1, duration),
    inPoint: 0,
    volume: 1,
    muted: false,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, anchorX: 0.5, anchorY: 0.5 },
    blendMode: 'normal',
    speed: 1,
    reverse: false,
    effects: [],
  };
}

export function clampProjectDuration(project: Project): Project {
  let end = 10;
  for (const track of project.tracks) {
    for (const clip of track.clips) end = Math.max(end, clip.start + clip.duration + 1);
  }
  return { ...project, duration: Math.max(10, end) };
}
