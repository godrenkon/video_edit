import { describe, expect, it } from 'vitest';
import { createProject, defaultClip } from './project';
import { detectSilenceRanges, mergeSilenceMarkers, silenceMarkersForAsset } from './silenceDetection';

describe('silence detection', () => {
  it('finds contiguous quiet waveform ranges and respects minimum duration', () => {
    const ranges = detectSilenceRanges({
      duration: 2,
      peaks: [0, 0.01, 0.2, 0.01, 0, 0, 0.2, 0],
    }, { threshold: 0.02, minDuration: 0.4, mergeGap: 0 });

    expect(ranges).toHaveLength(2);
    expect(ranges[0]).toMatchObject({ start: 0, end: 0.5, duration: 0.5 });
    expect(ranges[1]).toMatchObject({ start: 0.75, end: 1.5, duration: 0.75 });
  });

  it('merges quiet regions separated by a short non-silent gap', () => {
    const ranges = detectSilenceRanges({
      duration: 1,
      peaks: [0, 0, 0.5, 0, 0],
    }, { threshold: 0.02, minDuration: 0.2, mergeGap: 0.21 });

    expect(ranges).toHaveLength(1);
    expect(ranges[0].start).toBe(0);
    expect(ranges[0].end).toBe(1);
  });

  it('maps source silence through clip speed and in-point', () => {
    const project = createProject();
    project.assets = [{
      id: 'a', name: 'a.wav', kind: 'audio', mime: 'audio/wav', size: 1, duration: 20, storageName: 'a.wav',
    }];
    const clip = defaultClip('a.wav', 'a', 10, 4);
    clip.inPoint = 2;
    clip.speed = 2;
    project.tracks.find((track) => track.kind === 'audio')!.clips = [clip];

    const markers = silenceMarkersForAsset(project, 'a', [{ start: 4, end: 6, duration: 2, maxPeak: 0 }]);
    expect(markers).toHaveLength(1);
    expect(markers[0].time).toBe(11);
    expect(markers[0].duration).toBe(1);
  });

  it('maps reversed clips back onto ascending timeline ranges', () => {
    const project = createProject();
    project.assets = [{
      id: 'a', name: 'a.wav', kind: 'audio', mime: 'audio/wav', size: 1, duration: 20, storageName: 'a.wav',
    }];
    const clip = defaultClip('a.wav', 'a', 5, 4);
    clip.inPoint = 2;
    clip.speed = 2;
    clip.reverse = true;
    project.tracks.find((track) => track.kind === 'audio')!.clips = [clip];

    const markers = silenceMarkersForAsset(project, 'a', [{ start: 4, end: 6, duration: 2, maxPeak: 0 }]);
    expect(markers).toHaveLength(1);
    expect(markers[0].time).toBe(7);
    expect(markers[0].duration).toBe(1);
  });

  it('replaces only markers generated for the same asset', () => {
    const next = mergeSilenceMarkers([
      { id: 'manual', time: 1, name: 'manual' },
      { id: 'old-a', time: 2, name: 'old', note: 'auto-silence:a' },
      { id: 'old-b', time: 3, name: 'other', note: 'auto-silence:b' },
    ], 'a', [
      { id: 'new-a', time: 4, name: 'new', note: 'auto-silence:a' },
    ]);

    expect(next.map((marker) => marker.id)).toEqual(['manual', 'old-b', 'new-a']);
  });
});
