import { describe, expect, it } from 'vitest';
import type { Project } from '../types/editor';
import { buildAudioMixSegments, segmentSourceTime } from './audioMixer';

function baseProject(): Project {
  return {
    version: 2,
    id: 'p',
    name: 'audio-test',
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#000000',
    duration: 20,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    assets: [{ id: 'a1', name: 'voice', kind: 'audio', mime: 'audio/wav', size: 1, duration: 10, storageName: 'voice.wav' }],
    tracks: [{
      id: 'audio',
      name: 'Audio',
      kind: 'audio',
      muted: false,
      locked: false,
      clips: [{
        id: 'c1',
        kind: 'asset',
        name: 'voice',
        assetId: 'a1',
        start: 2,
        duration: 6,
        inPoint: 1,
        volume: 0.5,
        muted: false,
        speed: 2,
        reverse: false,
        transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
      }],
    }],
  };
}

describe('audio mix planning', () => {
  it('clips segments to the requested timeline chunk', () => {
    const [segment] = buildAudioMixSegments(baseProject(), 3, 5);
    expect(segment).toMatchObject({
      clipId: 'c1',
      assetId: 'a1',
      clipStart: 2,
      timelineStart: 3,
      timelineEnd: 5,
      sourceStart: 3,
      speed: 2,
      reverse: false,
      gain: 0.5,
    });
    expect(segmentSourceTime(segment, 4)).toBe(5);
  });

  it('respects muted and solo tracks', () => {
    const project = baseProject();
    project.tracks.push({ ...structuredClone(project.tracks[0]), id: 'audio2', solo: true });
    expect(buildAudioMixSegments(project, 0, 10).map((segment) => segment.clipId)).toEqual(['c1']);

    project.tracks[1].muted = true;
    expect(buildAudioMixSegments(project, 0, 10)).toHaveLength(0);
  });

  it('maps reverse clips backward through source time', () => {
    const project = baseProject();
    project.tracks[0].clips[0].reverse = true;
    const [segment] = buildAudioMixSegments(project, 3, 5);
    expect(segment.sourceStart).toBe(11);
    expect(segmentSourceTime(segment, 4)).toBe(9);
  });

  it('includes embedded audio candidates from video-track video assets', () => {
    const project = baseProject();
    project.assets.push({
      id: 'v1',
      name: 'camera.webm',
      kind: 'video',
      mime: 'video/webm',
      size: 1,
      duration: 8,
      width: 1920,
      height: 1080,
      storageName: 'camera.webm',
    });
    project.tracks.push({
      id: 'video',
      name: 'Video',
      kind: 'video',
      muted: false,
      locked: false,
      visible: true,
      clips: [{
        id: 'video-clip',
        kind: 'asset',
        name: 'camera',
        assetId: 'v1',
        start: 0,
        duration: 4,
        inPoint: 0,
        volume: 1,
        muted: false,
        speed: 1,
        reverse: false,
        transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
      }],
    });

    expect(buildAudioMixSegments(project, 0, 4).map((segment) => segment.clipId)).toEqual(['c1', 'video-clip']);
  });

  it('carries clip effects into the mixer plan', () => {
    const project = baseProject();
    project.tracks[0].clips[0].effects = [{
      id: 'gain',
      kind: 'gain',
      enabled: true,
      parameters: { gainDb: { value: -3 } },
    }];
    const [segment] = buildAudioMixSegments(project, 3, 4);
    expect(segment.effects.map((effect) => effect.kind)).toEqual(['gain']);
  });

  it('ignores muted clips and empty intersections', () => {
    const project = baseProject();
    project.tracks[0].clips[0].muted = true;
    expect(buildAudioMixSegments(project, 3, 5)).toEqual([]);
    project.tracks[0].clips[0].muted = false;
    expect(buildAudioMixSegments(project, 9, 10)).toEqual([]);
  });
});
