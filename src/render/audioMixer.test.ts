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

  it('ignores muted clips and empty intersections', () => {
    const project = baseProject();
    project.tracks[0].clips[0].muted = true;
    expect(buildAudioMixSegments(project, 3, 5)).toEqual([]);
    project.tracks[0].clips[0].muted = false;
    expect(buildAudioMixSegments(project, 9, 10)).toEqual([]);
  });
});
