import { describe, expect, it } from 'vitest';
import type { Project } from '../types/editor';
import { searchProject } from './projectSearch';

function project(): Project {
  return {
    version: 2,
    id: 'p',
    name: 'Search',
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#000',
    duration: 20,
    createdAt: '',
    updatedAt: '',
    assetBins: [{ id: 'bin-broll', name: 'B-roll' }],
    assets: [
      {
        id: 'asset-video',
        name: 'minecraft-intro.mp4',
        kind: 'video',
        mime: 'video/mp4',
        size: 1,
        duration: 8,
        storageName: 'video.mp4',
        binId: 'bin-broll',
        tags: ['gameplay', 'opening'],
        notes: 'best opening shot',
      },
      {
        id: 'asset-voice',
        name: 'voice.wav',
        kind: 'audio',
        mime: 'audio/wav',
        size: 1,
        duration: 4,
        storageName: 'voice.wav',
      },
    ],
    tracks: [
      {
        id: 'track-v',
        name: 'Video Main',
        kind: 'video',
        muted: false,
        locked: false,
        visible: true,
        clips: [{
          id: 'clip-v',
          kind: 'asset',
          name: 'Intro gameplay',
          assetId: 'asset-video',
          start: 2,
          duration: 5,
          inPoint: 0,
          volume: 1,
          muted: false,
          transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
          effects: [{ id: 'fx', kind: 'blur', enabled: true, parameters: {} }],
        }],
      },
      {
        id: 'track-s',
        name: '字幕',
        kind: 'subtitle',
        muted: false,
        locked: false,
        visible: true,
        clips: [{
          id: 'clip-s',
          kind: 'subtitle',
          name: '字幕 1',
          start: 3,
          duration: 2,
          inPoint: 0,
          volume: 1,
          muted: false,
          transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
          subtitle: { text: '昔の携帯電話はなぜ大きかった？', speaker: 'ずんだもん' },
        }],
      },
    ],
    markers: [{ id: 'marker', time: 7, name: '重要ポイント', note: '比較開始' }],
  };
}

describe('project-wide search', () => {
  it('finds assets by name, tags, notes and bin name', () => {
    expect(searchProject(project(), 'minecraft')[0]).toMatchObject({ kind: 'asset', assetId: 'asset-video' });
    expect(searchProject(project(), 'gameplay opening').some((result) => result.assetId === 'asset-video')).toBe(true);
    expect(searchProject(project(), 'best opening').some((result) => result.assetId === 'asset-video')).toBe(true);
    expect(searchProject(project(), 'B-roll').some((result) => result.assetId === 'asset-video')).toBe(true);
  });

  it('finds clip names, subtitle content, speakers and effects', () => {
    expect(searchProject(project(), 'Intro gameplay')[0]).toMatchObject({ kind: 'clip', clipId: 'clip-v', time: 2 });
    expect(searchProject(project(), '携帯電話').some((result) => result.clipId === 'clip-s')).toBe(true);
    expect(searchProject(project(), 'ずんだもん').some((result) => result.clipId === 'clip-s')).toBe(true);
    expect(searchProject(project(), 'blur').some((result) => result.clipId === 'clip-v')).toBe(true);
  });

  it('finds tracks, markers and bins', () => {
    expect(searchProject(project(), 'Video Main').some((result) => result.kind === 'track')).toBe(true);
    expect(searchProject(project(), '比較開始')).toMatchObject([{ kind: 'marker', time: 7 }]);
    expect(searchProject(project(), 'B-roll').some((result) => result.kind === 'bin')).toBe(true);
  });

  it('requires every search token and ranks exact titles ahead of metadata matches', () => {
    const results = searchProject(project(), 'Intro');
    expect(results[0]).toMatchObject({ kind: 'clip', clipId: 'clip-v' });
    expect(searchProject(project(), 'minecraft nonexistent')).toEqual([]);
  });

  it('returns no results for blank queries and respects result limits', () => {
    expect(searchProject(project(), '   ')).toEqual([]);
    expect(searchProject(project(), 'video', 1)).toHaveLength(1);
  });
});
