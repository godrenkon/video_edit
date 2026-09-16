import type { AssetKind, Clip, GeneratorPayload, Project, TrackKind } from '../types/editor';

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
    ...baseTimelineClip('asset', name, start, duration),
    assetId,
  };
}

export function defaultTextClip(start: number, duration = 5): Clip {
  return {
    ...baseTimelineClip('text', 'テキスト', start, duration),
    text: {
      text: 'テキスト',
      fontFamily: 'Noto Sans JP',
      fontSize: 72,
      fontWeight: 700,
      color: '#ffffff',
      strokeColor: '#000000',
      strokeWidth: 0,
      align: 'center',
    },
  };
}

export function defaultSubtitleClip(start: number, y = 0, duration = 4): Clip {
  const clip = baseTimelineClip('subtitle', '字幕', start, duration);
  clip.transform = { ...clip.transform, y };
  return {
    ...clip,
    subtitle: { text: '字幕テキスト' },
  };
}

export function defaultGeneratorClip(
  start: number,
  kind: GeneratorPayload['kind'] = 'color',
  duration = 5,
): Clip {
  const data: GeneratorPayload['data'] = kind === 'gradient'
    ? { startColor: '#161b22', endColor: '#5fd8ff', angle: 0 }
    : kind === 'noise'
      ? { speed: 8 }
      : kind === 'color'
        ? { color: '#202830' }
        : undefined;

  return {
    ...baseTimelineClip('generator', generatorName(kind), start, duration),
    generator: { kind, data },
  };
}

export function clampProjectDuration(project: Project): Project {
  let end = 10;
  for (const track of project.tracks) {
    for (const clip of track.clips) end = Math.max(end, clip.start + clip.duration + 1);
  }
  return { ...project, duration: Math.max(10, end) };
}

function baseTimelineClip(kind: Clip['kind'], name: string, start: number, duration: number): Clip {
  return {
    id: uid('clip'),
    kind,
    name,
    start: Math.max(0, start),
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

function generatorName(kind: GeneratorPayload['kind']) {
  if (kind === 'gradient') return 'グラデーション';
  if (kind === 'noise') return 'ノイズ';
  if (kind === 'bars') return 'カラーバー';
  if (kind === 'custom') return 'ジェネレーター';
  return 'カラーマット';
}
