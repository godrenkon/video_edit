import { describe, expect, it } from 'vitest';
import { beatMarkersForAsset, detectBeatCandidates, estimateBpm, mergeBeatMarkers } from './beatDetection';
import { createProject, defaultClip } from './project';

describe('beat detection', () => {
  it('detects strong local transients over a quieter baseline', () => {
    const peaks = Array.from({ length: 100 }, () => 0.05);
    for (const index of [10, 30, 50, 70, 90]) peaks[index] = 0.9;
    const result = detectBeatCandidates({ duration: 10, peaks }, {
      minPeak: 0.1,
      sensitivity: 1.4,
      minInterval: 0.5,
    });
    expect(result.candidates).toHaveLength(5);
    expect(result.candidates.map((candidate) => candidate.time)).toEqual([1.05, 3.05, 5.05, 7.05, 9.05]);
  });

  it('prefers the stronger transient inside the minimum interval', () => {
    const peaks = Array.from({ length: 40 }, () => 0.02);
    peaks[10] = 0.5;
    peaks[12] = 0.95;
    const result = detectBeatCandidates({ duration: 4, peaks }, {
      minPeak: 0.05,
      sensitivity: 1.2,
      minInterval: 0.4,
    });
    expect(result.candidates).toHaveLength(1);
    expect(result.candidates[0].time).toBeCloseTo(1.25);
  });

  it('estimates BPM from candidate spacing and normalizes octave', () => {
    const candidates = [0, 0.5, 1, 1.5, 2].map((time) => ({ time, peak: 1, score: 1 }));
    expect(estimateBpm(candidates)).toBe(120);
  });

  it('maps beat points through reverse and speed', () => {
    const project = createProject();
    project.assets = [{
      id: 'music', name: 'music.wav', kind: 'audio', mime: 'audio/wav', size: 1, duration: 20, storageName: 'music.wav',
    }];
    const clip = defaultClip('music.wav', 'music', 10, 4);
    clip.inPoint = 2;
    clip.speed = 2;
    clip.reverse = true;
    project.tracks.find((track) => track.kind === 'audio')!.clips = [clip];

    const markers = beatMarkersForAsset(project, 'music', [{ time: 4, peak: 1, score: 2 }]);
    expect(markers).toHaveLength(1);
    expect(markers[0].time).toBe(13);
  });

  it('replaces only generated beat markers for the selected asset', () => {
    const merged = mergeBeatMarkers([
      { id: 'manual', time: 1, name: 'manual' },
      { id: 'old-a', time: 2, name: 'old', note: 'auto-beat:a' },
      { id: 'old-b', time: 3, name: 'other', note: 'auto-beat:b' },
    ], 'a', [{ id: 'new-a', time: 4, name: 'Beat', note: 'auto-beat:a' }]);
    expect(merged.map((marker) => marker.id)).toEqual(['manual', 'old-b', 'new-a']);
  });
});
