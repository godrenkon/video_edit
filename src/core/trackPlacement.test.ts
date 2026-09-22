import { describe, expect, it } from 'vitest';
import { createProject, defaultClip, defaultSubtitleClip, defaultTextClip } from './project';
import { clipCanLiveOnTrack, moveClipToTrack, targetTrackForKind } from './trackPlacement';
import type { AssetMeta, Project } from '../types/editor';

function fixture() {
  const project = createProject();
  const videoTrack = project.tracks.find((track) => track.kind === 'video')!;
  const overlayTrack = project.tracks.find((track) => track.kind === 'overlay')!;
  const audioTrack = project.tracks.find((track) => track.kind === 'audio')!;
  const subtitleTrack = project.tracks.find((track) => track.kind === 'subtitle')!;
  const video: AssetMeta = { id: 'video', name: 'v.mp4', kind: 'video', mime: 'video/mp4', size: 1, duration: 20, storageName: 'v' };
  const audio: AssetMeta = { id: 'audio', name: 'a.wav', kind: 'audio', mime: 'audio/wav', size: 1, duration: 20, storageName: 'a' };
  return { project: { ...project, assets: [video, audio] } as Project, videoTrack, overlayTrack, audioTrack, subtitleTrack };
}

describe('track placement', () => {
  it('prefers an explicit unlocked target track over clip-selection fallback', () => {
    const { project, videoTrack } = fixture();
    const second = {
      ...videoTrack,
      id: 'video-2',
      name: 'Video 2',
      targeted: true,
      clips: [],
    };
    project.tracks = project.tracks.map((track) => track.id === videoTrack.id
      ? { ...track, targeted: false }
      : track);
    project.tracks.push(second);

    expect(targetTrackForKind(project, 'video', videoTrack.id)?.id).toBe('video-2');

    const locked = {
      ...project,
      tracks: project.tracks.map((track) => track.id === 'video-2' ? { ...track, locked: true } : track),
    };
    expect(targetTrackForKind(locked, 'video', videoTrack.id)?.id).toBe(videoTrack.id);
  });

  it('moves visual clips between video and overlay tracks without replacing existing clips', () => {
    const { project, videoTrack, overlayTrack } = fixture();
    const clip = defaultClip('video', 'video', 1, 4);
    const existing = defaultTextClip(1, 4);
    project.tracks = project.tracks.map((track) => track.id === videoTrack.id
      ? { ...track, clips: [clip] }
      : track.id === overlayTrack.id
        ? { ...track, clips: [existing] }
        : track);

    const moved = moveClipToTrack(project, clip.id, overlayTrack.id, 2.2, undefined, 0);
    expect(moved.tracks.find((track) => track.id === videoTrack.id)?.clips).toHaveLength(0);
    const overlay = moved.tracks.find((track) => track.id === overlayTrack.id)!;
    expect(overlay.clips).toHaveLength(2);
    expect(overlay.clips.find((item) => item.id === clip.id)?.start).toBeCloseTo(2.2, 1);
  });

  it('rejects incompatible audio/subtitle destinations and locked tracks', () => {
    const { project, videoTrack, audioTrack, subtitleTrack } = fixture();
    const clip = defaultClip('video', 'video', 0, 4);
    project.tracks = project.tracks.map((track) => track.id === videoTrack.id ? { ...track, clips: [clip] } : track);

    expect(clipCanLiveOnTrack(project, clip, audioTrack)).toBe(false);
    expect(clipCanLiveOnTrack(project, clip, subtitleTrack)).toBe(false);
    expect(moveClipToTrack(project, clip.id, audioTrack.id, 2)).toBe(project);

    const locked = { ...project, tracks: project.tracks.map((track) => track.id === videoTrack.id ? { ...track, locked: true } : track) };
    expect(moveClipToTrack(locked, clip.id, videoTrack.id, 2)).toBe(locked);
  });

  it('allows audio only on audio tracks and subtitles only on subtitle tracks', () => {
    const { project, videoTrack, audioTrack, subtitleTrack } = fixture();
    const audioClip = defaultClip('audio', 'audio', 0, 4);
    const subtitle = defaultSubtitleClip(0, 0, 4);
    expect(clipCanLiveOnTrack(project, audioClip, audioTrack)).toBe(true);
    expect(clipCanLiveOnTrack(project, audioClip, videoTrack)).toBe(false);
    expect(clipCanLiveOnTrack(project, subtitle, subtitleTrack)).toBe(true);
    expect(clipCanLiveOnTrack(project, subtitle, videoTrack)).toBe(false);
  });
});
