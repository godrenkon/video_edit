import { describe, expect, it } from 'vitest';
import { createProject, defaultClip } from '../core/project';
import {
  frameSignature,
  mergeSceneMarkers,
  sceneMarkersForAsset,
  signatureDistance,
} from './sceneDetection';

function image(pixels: number[][], width: number, height: number) {
  return {
    data: new Uint8ClampedArray(pixels.flat()),
    width,
    height,
    colorSpace: 'srgb',
  } as ImageData;
}

describe('scene detection primitives', () => {
  it('returns zero distance for identical signatures', () => {
    const source = image([
      [255, 0, 0, 255],
      [0, 255, 0, 255],
    ], 2, 1);
    const a = frameSignature(source, 8);
    const b = frameSignature(source, 8);
    expect(signatureDistance(a, b)).toBeCloseTo(0, 8);
  });

  it('detects a large histogram change between solid colors', () => {
    const red = frameSignature(image([[255, 0, 0, 255]], 1, 1), 8);
    const blue = frameSignature(image([[0, 0, 255, 255]], 1, 1), 8);
    expect(signatureDistance(red, blue)).toBeGreaterThan(0.5);
  });

  it('maps scene points through clip speed and in-point', () => {
    const project = createProject();
    project.assets = [{
      id: 'v', name: 'v.mp4', kind: 'video', mime: 'video/mp4', size: 1, duration: 20, storageName: 'v.mp4',
    }];
    const clip = defaultClip('v.mp4', 'v', 10, 4);
    clip.inPoint = 2;
    clip.speed = 2;
    project.tracks.find((track) => track.kind === 'video')!.clips = [clip];

    const markers = sceneMarkersForAsset(project, 'v', [{ time: 4, score: 0.8 }]);
    expect(markers).toHaveLength(1);
    expect(markers[0].time).toBe(11);
  });

  it('maps reverse clips onto ascending timeline time', () => {
    const project = createProject();
    project.assets = [{
      id: 'v', name: 'v.mp4', kind: 'video', mime: 'video/mp4', size: 1, duration: 20, storageName: 'v.mp4',
    }];
    const clip = defaultClip('v.mp4', 'v', 5, 4);
    clip.inPoint = 2;
    clip.speed = 2;
    clip.reverse = true;
    project.tracks.find((track) => track.kind === 'video')!.clips = [clip];

    const markers = sceneMarkersForAsset(project, 'v', [{ time: 4, score: 0.8 }]);
    expect(markers).toHaveLength(1);
    expect(markers[0].time).toBe(8);
  });

  it('replaces only generated scene markers for the selected asset', () => {
    const merged = mergeSceneMarkers([
      { id: 'manual', time: 1, name: 'manual' },
      { id: 'old-a', time: 2, name: 'old', note: 'auto-scene:a' },
      { id: 'old-b', time: 3, name: 'other', note: 'auto-scene:b' },
    ], 'a', [{ id: 'new-a', time: 4, name: 'Scene', note: 'auto-scene:a' }]);

    expect(merged.map((marker) => marker.id)).toEqual(['manual', 'old-b', 'new-a']);
  });
});
