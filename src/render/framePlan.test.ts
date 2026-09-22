import { describe, expect, it } from 'vitest';
import type { Clip, Project, Track } from '../types/editor';
import { buildVisualFramePlan } from './framePlan';

function clip(id: string, trackKind: Track['kind'], patch: Partial<Clip> = {}): Clip {
  return {
    id,
    kind: trackKind === 'subtitle' ? 'subtitle' : 'asset',
    name: id,
    assetId: `asset-${id}`,
    start: 0,
    duration: 10,
    inPoint: 0,
    volume: 1,
    muted: false,
    transform: { x: 10, y: 20, scale: 1, rotation: 0, opacity: 0.8 },
    speed: 1,
    reverse: false,
    effects: [],
    ...patch,
  };
}

function track(id: string, kind: Track['kind'], clips: Clip[], visible = true): Track {
  return { id, name: id, kind, muted: false, locked: false, visible, clips };
}

function project(tracks: Track[]): Project {
  return {
    version: 2,
    id: 'project',
    name: 'Frame plan',
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#000000',
    duration: 10,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    assets: [],
    tracks,
    markers: [],
  };
}

describe('buildVisualFramePlan', () => {
  it('builds bottom-to-top visual layers and ignores hidden tracks', () => {
    const input = project([
      track('overlay', 'overlay', [clip('overlay', 'overlay')]),
      track('hidden', 'video', [clip('hidden', 'video')], false),
      track('video', 'video', [clip('video', 'video')]),
      track('audio', 'audio', [clip('audio', 'audio')]),
    ]);

    const plan = buildVisualFramePlan(input, 1);
    expect(plan.map((layer) => layer.clipId)).toEqual(['video', 'overlay']);
    expect(plan.map((layer) => layer.trackId)).toEqual(['video', 'overlay']);
  });

  it('carries source timing, transform, crop and blend state into a renderer-safe plan', () => {
    const inputClip = clip('video', 'video', {
      inPoint: 2,
      speed: 2,
      crop: { top: 1, right: 2, bottom: 3, left: 4 },
      blendMode: 'screen',
      transform: { x: 3, y: 4, scale: 1.5, rotation: 12, opacity: 0.6, anchorX: 0.25, anchorY: 0.75 },
    });
    const plan = buildVisualFramePlan(project([track('video', 'video', [inputClip])]), 1.5);

    expect(plan[0]).toMatchObject({
      assetId: 'asset-video',
      sourceTime: 5,
      crop: { top: 1, right: 2, bottom: 3, left: 4 },
      blendMode: 'screen',
      transform: { x: 3, y: 4, scale: 1.5, rotation: 12, opacity: 0.6, anchorX: 0.25, anchorY: 0.75 },
    });
  });

  it('applies dissolve opacity with the same frame-plan transform used by export', () => {
    const source = clip('video', 'video', {
      transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 0.8 },
      transitionIn: { kind: 'dissolve', duration: 2 },
      transitionOut: { kind: 'dissolve', duration: 2 },
    });
    const input = project([track('video', 'video', [source])]);

    expect(buildVisualFramePlan(input, 1)[0].transform.opacity).toBeCloseTo(0.4, 8);
    expect(buildVisualFramePlan(input, 5)[0].transform.opacity).toBeCloseTo(0.8, 8);
    expect(buildVisualFramePlan(input, 9)[0].transform.opacity).toBeCloseTo(0.4, 8);
  });

  it('carries dip-to-black brightness through the shared export frame plan', () => {
    const source = clip('video', 'video', {
      transitionIn: { kind: 'dip-black', duration: 2 },
      transitionOut: { kind: 'dip-black', duration: 2 },
    });
    const input = project([track('video', 'video', [source])]);

    expect(buildVisualFramePlan(input, 0)[0].transitionBrightness).toBe(0);
    expect(buildVisualFramePlan(input, 1)[0].transitionBrightness).toBeCloseTo(0.5, 8);
    expect(buildVisualFramePlan(input, 5)[0].transitionBrightness).toBe(1);
    expect(buildVisualFramePlan(input, 9)[0].transitionBrightness).toBeCloseTo(0.5, 8);
  });

  it('applies slide transition motion in the shared export frame plan', () => {
    const source = clip('video', 'video', {
      transform: { x: 10, y: 20, scale: 1, rotation: 0, opacity: 1 },
      transitionIn: { kind: 'slide-left', duration: 2 },
      transitionOut: { kind: 'slide-up', duration: 2 },
    });
    const input = project([track('video', 'video', [source])]);

    expect(buildVisualFramePlan(input, 0)[0].transform).toMatchObject({ x: 1930, y: 20 });
    expect(buildVisualFramePlan(input, 1)[0].transform).toMatchObject({ x: 970, y: 20 });
    expect(buildVisualFramePlan(input, 5)[0].transform).toMatchObject({ x: 10, y: 20 });
    expect(buildVisualFramePlan(input, 9)[0].transform).toMatchObject({ x: 10, y: -520 });
    expect(buildVisualFramePlan(input, 9.5)[0].transform).toMatchObject({ x: 10, y: -790 });
  });

  it('carries wipe reveal geometry into the shared frame plan', () => {
    const source = clip('video', 'video', {
      transitionIn: { kind: 'wipe-left', duration: 2 },
      transitionOut: { kind: 'wipe-down', duration: 2 },
    });
    const input = project([track('video', 'video', [source])]);

    expect(buildVisualFramePlan(input, 1)[0].reveal).toEqual({ x: 0.5, y: 0, width: 0.5, height: 1 });
    expect(buildVisualFramePlan(input, 5)[0].reveal).toEqual({ x: 0, y: 0, width: 1, height: 1 });
    expect(buildVisualFramePlan(input, 9)[0].reveal).toEqual({ x: 0, y: 0.5, width: 1, height: 0.5 });
  });

  it('resolves Zundamon asset selection and bobbing before renderer dispatch', () => {
    const z = clip('z', 'overlay', {
      kind: 'zundamon',
      assetId: undefined,
      transform: { x: 0, y: 100, scale: 1, rotation: 0, opacity: 1 },
      zundamon: {
        closedAssetId: 'closed',
        halfAssetId: 'half',
        openAssetId: 'open',
        audioAssetId: 'voice',
        cues: [{ time: 0, state: 2 }],
        blinkEvery: 5,
        bobAmount: 8,
        bobSpeed: 1,
      },
    });

    const plan = buildVisualFramePlan(project([track('overlay', 'overlay', [z])]), 0.25);
    expect(plan[0].assetId).toBe('open');
    expect(plan[0].transform.y).toBeCloseTo(108, 8);
  });

  it('filters disabled effects and clones nested effect values', () => {
    const source = clip('video', 'video', {
      effects: [
        {
          id: 'enabled',
          kind: 'color',
          enabled: true,
          parameters: {
            amount: {
              value: [1, 2],
              keyframes: [{ id: 'k', time: 0, value: [3, 4], interpolation: 'bezier', inTangent: [0, 0], outTangent: [1, 1] }],
            },
          },
        },
        { id: 'disabled', kind: 'blur', enabled: false, parameters: {} },
      ],
    });
    const plan = buildVisualFramePlan(project([track('video', 'video', [source])]), 1);

    expect(plan[0].effects.map((effect) => effect.id)).toEqual(['enabled']);
    const value = plan[0].effects[0].parameters.amount.value as number[];
    value[0] = 99;
    expect(source.effects?.[0].parameters.amount.value).toEqual([1, 2]);
  });
  it('carries clip masks into the shared frame plan without sharing mutable objects', () => {
    const source = clip('video', 'video', {
      masks: [
        { id: 'rect', kind: 'rectangle', x: 0.1, y: 0.2, width: 0.3, height: 0.4 },
        { id: 'ellipse', kind: 'ellipse', x: 0.5, y: 0.1, width: 0.25, height: 0.5 },
      ],
    });
    const plan = buildVisualFramePlan(project([track('video', 'video', [source])]), 1);

    expect(plan[0].masks).toEqual(source.masks);
    plan[0].masks[0].x = 0.9;
    expect(source.masks?.[0].x).toBe(0.1);
  });

});
