import { describe, expect, it } from 'vitest';
import type { Clip, Project, Track } from '../types/editor';
import {
  audioTimelineItems,
  clipSourceTime,
  isClipActive,
  mouthCueState,
  visualTimelineItems,
  zundamonVisualState,
} from './timelineEvaluation';

function makeClip(id: string, start = 1, duration = 4, patch: Partial<Clip> = {}): Clip {
  return {
    id,
    kind: 'asset',
    name: id,
    assetId: `asset-${id}`,
    start,
    duration,
    inPoint: 0.5,
    volume: 1,
    muted: false,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    speed: 1,
    reverse: false,
    ...patch,
  };
}

function makeTrack(id: string, kind: Track['kind'], clips: Clip[], patch: Partial<Track> = {}): Track {
  return {
    id,
    name: id,
    kind,
    muted: false,
    locked: false,
    visible: true,
    clips,
    ...patch,
  };
}

function makeProject(tracks: Track[]): Project {
  return {
    version: 2,
    id: 'project',
    name: 'Evaluation',
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#000000',
    duration: 20,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    assets: [],
    tracks,
    markers: [],
  };
}

describe('timeline evaluation', () => {
  it('treats clip start as inclusive and clip end as exclusive', () => {
    const clip = makeClip('a', 2, 3);
    expect(isClipActive(clip, 1.999)).toBe(false);
    expect(isClipActive(clip, 2)).toBe(true);
    expect(isClipActive(clip, 4.999)).toBe(true);
    expect(isClipActive(clip, 5)).toBe(false);
  });

  it('maps timeline time to source time using in-point and speed', () => {
    const clip = makeClip('a', 2, 4, { inPoint: 1, speed: 2 });
    expect(clipSourceTime(clip, 2)).toBe(1);
    expect(clipSourceTime(clip, 3.5)).toBe(4);
  });

  it('maps reversed clips from their tail toward their in-point', () => {
    const clip = makeClip('a', 2, 4, { inPoint: 1, speed: 2, reverse: true });
    expect(clipSourceTime(clip, 2)).toBe(9);
    expect(clipSourceTime(clip, 3.5)).toBe(6);
  });

  it('uses actual cue timestamps instead of assuming fixed cue spacing', () => {
    const cues = [
      { time: 0, state: 0 as const },
      { time: 0.2, state: 2 as const },
      { time: 0.8, state: 1 as const },
    ];

    expect(mouthCueState(cues, 0.1)).toBe(0);
    expect(mouthCueState(cues, 0.5)).toBe(2);
    expect(mouthCueState(cues, 0.9)).toBe(1);
  });

  it('evaluates Zundamon mouth, blink and bob from the same timeline time', () => {
    const clip = makeClip('z', 0, 10, {
      kind: 'zundamon',
      zundamon: {
        closedAssetId: 'closed',
        halfAssetId: 'half',
        openAssetId: 'open',
        blinkAssetId: 'blink',
        audioAssetId: 'audio',
        cues: [
          { time: 0, state: 0 },
          { time: 0.2, state: 2, vowel: 'a' },
          { time: 0.6, state: 2, vowel: 'i' },
        ],
        vowelAssetIds: { a: 'mouth-a' },
        blinkEvery: 1,
        bobAmount: 10,
        bobSpeed: 1,
      },
    });

    expect(zundamonVisualState(clip, 0.3)).toMatchObject({ assetId: 'mouth-a', mouthState: 2, blinking: false });
    expect(zundamonVisualState(clip, 0.7)).toMatchObject({ assetId: 'open', mouthState: 2, blinking: false });
    expect(zundamonVisualState(clip, 1.4)).toMatchObject({ assetId: 'blink', blinking: true });
    expect(zundamonVisualState(clip, 0.25).bobOffset).toBeCloseTo(10, 8);
  });

  it('returns visible visual layers in compositor order and audio separately', () => {
    const project = makeProject([
      makeTrack('overlay', 'overlay', [makeClip('overlay', 0, 5)]),
      makeTrack('hidden', 'video', [makeClip('hidden', 0, 5)], { visible: false }),
      makeTrack('video', 'video', [makeClip('video', 0, 5)]),
      makeTrack('audio', 'audio', [makeClip('audio', 0, 5)]),
    ]);

    expect(visualTimelineItems(project, 1).map((item) => item.clip.id)).toEqual(['video', 'overlay']);
    expect(audioTimelineItems(project, 1).map((item) => item.clip.id)).toEqual(['audio']);
  });

  it('applies bus gain/mute to preview audio track state', () => {
    const source = makeClip('audio', 0, 5, { volume: 1 });
    const project = makeProject([makeTrack('audio', 'audio', [source], { gain: 0.5, pan: 0.2, busId: 'voice' })]);
    project.audioBuses = [
      { id: 'master', gain: 0.8, muted: false },
      { id: 'voice', gain: 0.5, muted: false },
    ];

    const [item] = audioTimelineItems(project, 1);
    expect(item.track.gain).toBeCloseTo(0.2, 8);
    expect(item.track.pan).toBeCloseTo(0.2, 8);

    project.audioBuses[1].muted = true;
    expect(audioTimelineItems(project, 1)).toEqual([]);
  });

  it('applies clip fade envelope to preview audio volume without mutating the project clip', () => {
    const source = makeClip('audio', 2, 8, { volume: 0.8, fadeIn: 2, fadeOut: 2 });
    const project = makeProject([makeTrack('audio', 'audio', [source])]);

    expect(audioTimelineItems(project, 2)[0].clip.volume).toBe(0);
    expect(audioTimelineItems(project, 3)[0].clip.volume).toBeCloseTo(0.4, 8);
    expect(audioTimelineItems(project, 6)[0].clip.volume).toBeCloseTo(0.8, 8);
    expect(audioTimelineItems(project, 9)[0].clip.volume).toBeCloseTo(0.4, 8);
    expect(source.volume).toBe(0.8);
  });
  it('holds a frozen clip on one source frame and removes embedded video audio', () => {
    const frozen = makeClip('frozen', 2, 4, { assetId: 'video', inPoint: 1, freezeFrameAt: 3.25 });
    const input = {
      ...makeProject([
        makeTrack('video-track', 'video', [frozen]),
      ]),
      assets: [{ id: 'video', name: 'Video', kind: 'video' as const, mime: 'video/mp4', size: 1, duration: 10, storageName: 'video.mp4' }],
    };

    expect(clipSourceTime(frozen, 2)).toBe(3.25);
    expect(clipSourceTime(frozen, 5.9)).toBe(3.25);
    expect(audioTimelineItems(input, 3)).toHaveLength(0);
  });
});
