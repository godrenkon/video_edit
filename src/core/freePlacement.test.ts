import { describe, expect, it } from 'vitest';
import { createProject, defaultClip, defaultSubtitleClip } from './project';
import { placeClipOnAvailableTrack } from './freePlacement';

describe('free timeline placement', () => {
  it('creates another video track instead of destroying an overlapping clip', () => {
    const project = createProject();
    const videoTrack = project.tracks.find((track) => track.kind === 'video')!;
    const first = defaultClip('A', 'asset-a', 0, 10);
    const incoming = defaultClip('B', 'asset-b', 2, 5);
    const withFirst = {
      ...project,
      tracks: project.tracks.map((track) => (
        track.id === videoTrack.id ? { ...track, clips: [first] } : track
      )),
    };

    const next = placeClipOnAvailableTrack(withFirst, incoming, 'video');

    expect(next.tracks.filter((track) => track.kind === 'video')).toHaveLength(2);
    expect(next.tracks.flatMap((track) => track.clips).map((clip) => clip.id)).toEqual(
      expect.arrayContaining([first.id, incoming.id]),
    );
    expect(next.tracks.find((track) => track.id === videoTrack.id)?.clips.map((clip) => clip.id)).toEqual([first.id]);
  });

  it('reuses an unlocked compatible track when time ranges do not overlap', () => {
    const project = createProject();
    const videoTrack = project.tracks.find((track) => track.kind === 'video')!;
    const first = defaultClip('A', 'asset-a', 0, 4);
    const incoming = defaultClip('B', 'asset-b', 4, 3);
    const withFirst = {
      ...project,
      tracks: project.tracks.map((track) => (
        track.id === videoTrack.id ? { ...track, clips: [first] } : track
      )),
    };

    const next = placeClipOnAvailableTrack(withFirst, incoming, 'video');

    expect(next.tracks.filter((track) => track.kind === 'video')).toHaveLength(1);
    expect(next.tracks.find((track) => track.id === videoTrack.id)?.clips.map((clip) => clip.id)).toEqual([first.id, incoming.id]);
  });

  it('allows overlapping subtitles by creating a second subtitle lane', () => {
    const project = createProject();
    const subtitleTrack = project.tracks.find((track) => track.kind === 'subtitle')!;
    const first = defaultSubtitleClip(0, 320, 5);
    const incoming = defaultSubtitleClip(1, 220, 5);
    const withFirst = {
      ...project,
      tracks: project.tracks.map((track) => (
        track.id === subtitleTrack.id ? { ...track, clips: [first] } : track
      )),
    };

    const next = placeClipOnAvailableTrack(withFirst, incoming, 'subtitle');

    expect(next.tracks.filter((track) => track.kind === 'subtitle')).toHaveLength(2);
    expect(next.tracks.flatMap((track) => track.clips).filter((clip) => clip.kind === 'subtitle')).toHaveLength(2);
  });
});
