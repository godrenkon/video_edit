import { describe, expect, it } from 'vitest';
import { applyTrackGainPan, dbToLinear, linearToDb, normalizeAudioBuses, normalizeTrackGain, normalizeTrackPan, resolveTrackBusMix, setAudioBusGain, setAudioBusMuted, setTrackBus } from './trackMix';
import type { Project, Track } from '../types/editor';

describe('track mix helpers', () => {
  it('normalizes missing and invalid gain/pan safely', () => {
    expect(normalizeTrackGain(undefined)).toBe(1);
    expect(normalizeTrackGain(99)).toBe(4);
    expect(normalizeTrackPan(undefined)).toBe(0);
    expect(normalizeTrackPan(-9)).toBe(-1);
  });

  it('converts gain between dB and linear values', () => {
    expect(dbToLinear(0)).toBeCloseTo(1, 8);
    expect(dbToLinear(-6)).toBeCloseTo(10 ** (-6 / 20), 8);
    expect(linearToDb(1)).toBeCloseTo(0, 8);
    expect(linearToDb(0)).toBe(-60);
  });

  it('applies a centered gain without changing stereo balance', () => {
    const [left, right] = applyTrackGainPan(0.5, 0.25, 2, 0);
    expect(left).toBeCloseTo(1, 8);
    expect(right).toBeCloseTo(0.5, 8);
  });

  it('uses equal-power pan endpoints', () => {
    const [leftHard, rightHard] = applyTrackGainPan(1, 1, 1, -1);
    expect(leftHard).toBeCloseTo(Math.SQRT2, 8);
    expect(rightHard).toBeCloseTo(0, 8);

    const [leftRight, rightRight] = applyTrackGainPan(1, 1, 1, 1);
    expect(leftRight).toBeCloseTo(0, 8);
    expect(rightRight).toBeCloseTo(Math.SQRT2, 8);
  });
  it('normalizes the fixed bus set with unity defaults', () => {
    expect(normalizeAudioBuses(undefined)).toEqual([
      { id: 'master', gain: 1, muted: false },
      { id: 'voice', gain: 1, muted: false },
      { id: 'music', gain: 1, muted: false },
      { id: 'sfx', gain: 1, muted: false },
    ]);
  });

  it('combines track, assigned bus, and master gain exactly once', () => {
    const track = makeTrack({ gain: 0.5, pan: 0.25, busId: 'voice' });
    const project = makeProject(track, [
      { id: 'master', gain: 0.8, muted: false },
      { id: 'voice', gain: 0.5, muted: false },
    ]);
    expect(resolveTrackBusMix(project, track)).toMatchObject({
      gain: 0.2,
      pan: 0.25,
      muted: false,
      busId: 'voice',
    });

    const masterTrack = makeTrack({ gain: 0.5, busId: 'master' });
    expect(resolveTrackBusMix(project, masterTrack).gain).toBeCloseTo(0.4, 8);
  });

  it('mutes through either assigned bus or master and defaults old tracks to master', () => {
    const voice = makeTrack({ busId: 'voice' });
    expect(resolveTrackBusMix(makeProject(voice, [{ id: 'voice', gain: 1, muted: true }]), voice).muted).toBe(true);
    expect(resolveTrackBusMix(makeProject(voice, [{ id: 'master', gain: 1, muted: true }]), voice).muted).toBe(true);

    const legacy = makeTrack({});
    expect(resolveTrackBusMix(makeProject(legacy), legacy)).toMatchObject({ busId: 'master', gain: 1, muted: false });
  });

  it('updates bus gain/mute and track assignment immutably', () => {
    const track = makeTrack({});
    let project = makeProject(track);
    project = setTrackBus(project, track.id, 'music');
    project = setAudioBusGain(project, 'music', 0.25);
    project = setAudioBusMuted(project, 'sfx', true);
    expect(project.tracks[0].busId).toBe('music');
    expect(normalizeAudioBuses(project.audioBuses).find((bus) => bus.id === 'music')?.gain).toBe(0.25);
    expect(normalizeAudioBuses(project.audioBuses).find((bus) => bus.id === 'sfx')?.muted).toBe(true);
  });
});

function makeTrack(patch: Partial<Track>): Track {
  return {
    id: 'track',
    name: 'Track',
    kind: 'audio',
    muted: false,
    locked: false,
    visible: true,
    clips: [],
    ...patch,
  };
}

function makeProject(track: Track, audioBuses?: Project['audioBuses']): Project {
  return {
    version: 2,
    id: 'project',
    name: 'Mix',
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#000000',
    duration: 10,
    createdAt: '',
    updatedAt: '',
    assets: [],
    tracks: [track],
    markers: [],
    audioBuses,
  };
}
