import type { AssetKind, Clip, GeneratorPayload, Project, TrackKind } from '../types/editor';

export type LowerThirdPreset = 'clean' | 'accent' | 'minimal';

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

export function defaultLowerThirdClip(
  start: number,
  width: number,
  height: number,
  preset: LowerThirdPreset = 'clean',
  duration = 5,
): Clip {
  const clip = baseTimelineClip('text', '下部テロップ', start, duration);
  const safeWidth = Math.max(1, width);
  const safeHeight = Math.max(1, height);
  clip.transform = {
    ...clip.transform,
    x: -safeWidth * 0.43,
    y: safeHeight * 0.34,
    anchorX: 0,
    anchorY: 0.5,
  };

  const base = {
    text: '名前\n肩書き / 説明',
    fontFamily: 'Noto Sans JP',
    align: 'left' as const,
  };

  if (preset === 'accent') {
    return {
      ...clip,
      name: '下部テロップ / Accent',
      text: {
        ...base,
        fontSize: 54,
        fontWeight: 800,
        color: '#071014',
        strokeColor: '#071014',
        strokeWidth: 0,
        backgroundColor: '#5fd8ff',
        shadowColor: '#000000',
        shadowBlur: 10,
        shadowOffsetX: 0,
        shadowOffsetY: 3,
      },
    };
  }

  if (preset === 'minimal') {
    return {
      ...clip,
      name: '下部テロップ / Minimal',
      text: {
        ...base,
        fontSize: 52,
        fontWeight: 700,
        color: '#ffffff',
        strokeColor: '#000000',
        strokeWidth: 2,
        shadowColor: '#000000',
        shadowBlur: 8,
        shadowOffsetX: 0,
        shadowOffsetY: 2,
      },
    };
  }

  return {
    ...clip,
    name: '下部テロップ / Clean',
    text: {
      ...base,
      fontSize: 54,
      fontWeight: 700,
      color: '#ffffff',
      strokeColor: '#000000',
      strokeWidth: 0,
      backgroundColor: 'rgba(12,18,22,0.86)',
      shadowColor: '#000000',
      shadowBlur: 8,
      shadowOffsetX: 0,
      shadowOffsetY: 2,
    },
  };
}

export function defaultSubtitleClip(start: number, y = 0, duration = 4): Clip {
  const clip = baseTimelineClip('subtitle', '字幕', start, duration);
  clip.transform = { ...clip.transform, y };
  return {
    ...clip,
    text: {
      text: '字幕テキスト',
      fontFamily: 'Noto Sans JP',
      fontSize: 64,
      fontWeight: 800,
      color: '#ffffff',
      strokeColor: '#000000',
      strokeWidth: 2,
      align: 'center',
    },
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
