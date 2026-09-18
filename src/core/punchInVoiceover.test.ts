import { describe, expect, it } from 'vitest';
import type { AssetMeta, Project } from '../types/editor';
import { addPunchInVoiceover } from './punchInVoiceover';

const asset = (id = 'voice', duration = 4): AssetMeta => ({
  id,
  name: 'voice.webm',
  kind: 'audio',
  mime: 'audio/webm',
  size: 100,
  duration,
  storageName: `${id}.webm`,
});

const project = (): Project => ({
  version: 2,
  id: 'p',
  name: 'p',
  width: 1920,
  height: 1080,
  fps: 30,
  background: '#000000',
  duration: 10,
  createdAt: '',
  updatedAt: '',
  assets: [],
  markers: [],
  tracks: [{
    id: 'a1',
    name: 'オーディオ 1',
    kind: 'audio',
    muted: false,
    locked: false,
    visible: true,
    clips: [],
  }],
});

describe('punch-in voiceover placement', () => {
  it('creates a dedicated voice bus track and places the recording at the requested time', () => {
    const result = addPunchInVoiceover(project(), asset(), 3.5, { clipId: 'punch-clip' });
    const track = result.project.tracks.find((item) => item.id === result.trackId);
    expect(track).toMatchObject({ kind: 'audio', name: 'ボイスオーバー', busId: 'voice' });
    expect(track?.clips[0]).toMatchObject({
      id: 'punch-clip',
      assetId: 'voice',
      start: 3.5,
      duration: 4,
    });
    expect(result.project.assets.map((item) => item.id)).toContain('voice');
  });

  it('reuses an unlocked voice bus track on later recordings', () => {
    const first = addPunchInVoiceover(project(), asset('one'), 1);
    const second = addPunchInVoiceover(first.project, asset('two'), 5);
    expect(second.trackId).toBe(first.trackId);
    const voiceTracks = second.project.tracks.filter((track) => track.kind === 'audio' && track.busId === 'voice');
    expect(voiceTracks).toHaveLength(1);
    expect(voiceTracks[0].clips).toHaveLength(2);
  });

  it('creates a new voice track when the existing voice track is locked', () => {
    const first = addPunchInVoiceover(project(), asset('one'), 1);
    const locked = {
      ...first.project,
      tracks: first.project.tracks.map((track) => track.id === first.trackId ? { ...track, locked: true } : track),
    };
    const second = addPunchInVoiceover(locked, asset('two'), 2);
    expect(second.trackId).not.toBe(first.trackId);
    expect(second.project.tracks.filter((track) => track.busId === 'voice')).toHaveLength(2);
  });

  it('extends project duration for a long punch-in without changing unrelated tracks', () => {
    const input = project();
    const originalTrack = input.tracks[0];
    const result = addPunchInVoiceover(input, asset('long', 12), 8);
    expect(result.project.duration).toBeGreaterThanOrEqual(21);
    expect(result.project.tracks.find((track) => track.id === 'a1')).toBe(originalTrack);
  });

  it('ignores non-audio assets', () => {
    const video = { ...asset(), kind: 'video' as const, mime: 'video/webm' };
    const input = project();
    expect(addPunchInVoiceover(input, video, 1)).toEqual({ project: input, clipId: null, trackId: null });
  });
});
