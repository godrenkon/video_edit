import type { AudioBusId, AudioBusSettings, Project, Track } from '../types/editor';

export const AUDIO_BUS_DEFINITIONS: Array<{ id: AudioBusId; label: string }> = [
  { id: 'master', label: 'Master' },
  { id: 'voice', label: 'Voice' },
  { id: 'music', label: 'Music' },
  { id: 'sfx', label: 'SFX' },
];

export function normalizeAudioBuses(buses: AudioBusSettings[] | undefined): AudioBusSettings[] {
  const byId = new Map<AudioBusId, AudioBusSettings>();
  for (const bus of buses ?? []) {
    if (!isAudioBusId(bus.id) || byId.has(bus.id)) continue;
    byId.set(bus.id, {
      id: bus.id,
      gain: normalizeTrackGain(bus.gain),
      muted: Boolean(bus.muted),
    });
  }
  return AUDIO_BUS_DEFINITIONS.map(({ id }) => byId.get(id) ?? { id, gain: 1, muted: false });
}

export function resolveTrackBusMix(project: Pick<Project, 'audioBuses'>, track: Pick<Track, 'gain' | 'pan' | 'busId' | 'muted'>) {
  const buses = normalizeAudioBuses(project.audioBuses);
  const byId = new Map(buses.map((bus) => [bus.id, bus]));
  const master = byId.get('master')!;
  const assignedId = track.busId && track.busId !== 'master' ? track.busId : 'master';
  const assigned = byId.get(assignedId) ?? master;
  const busGain = master.gain * (assigned.id === 'master' ? 1 : assigned.gain);
  return {
    gain: normalizeTrackGain(track.gain) * busGain,
    pan: normalizeTrackPan(track.pan),
    muted: Boolean(track.muted || master.muted || (assigned.id !== 'master' && assigned.muted)),
    busId: assigned.id,
  };
}

export function setAudioBusGain(project: Project, busId: AudioBusId, gain: number): Project {
  const buses = normalizeAudioBuses(project.audioBuses).map((bus) => bus.id === busId
    ? { ...bus, gain: normalizeTrackGain(gain) }
    : bus);
  return { ...project, audioBuses: buses };
}

export function setAudioBusMuted(project: Project, busId: AudioBusId, muted: boolean): Project {
  const buses = normalizeAudioBuses(project.audioBuses).map((bus) => bus.id === busId
    ? { ...bus, muted }
    : bus);
  return { ...project, audioBuses: buses };
}

export function setTrackBus(project: Project, trackId: string, busId: AudioBusId): Project {
  if (!isAudioBusId(busId)) return project;
  let changed = false;
  const tracks = project.tracks.map((track) => {
    if (track.id !== trackId || (track.kind !== 'audio' && track.kind !== 'video')) return track;
    changed = true;
    return { ...track, busId };
  });
  return changed ? { ...project, tracks } : project;
}

export function isAudioBusId(value: unknown): value is AudioBusId {
  return value === 'master' || value === 'voice' || value === 'music' || value === 'sfx';
}

export function normalizeTrackGain(value: number | undefined) {
  if (value === undefined) return 1;
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(4, value));
}

export function normalizeTrackPan(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

export function dbToLinear(db: number) {
  if (!Number.isFinite(db)) return 1;
  if (db <= -60) return 0;
  return Math.min(4, 10 ** (db / 20));
}

export function linearToDb(gain: number) {
  const safe = Math.max(0, Number.isFinite(gain) ? gain : 1);
  if (safe <= 1e-6) return -60;
  return Math.max(-60, Math.min(12, 20 * Math.log10(safe)));
}

export function applyTrackGainPan(left: number, right: number, gain: number | undefined, pan: number | undefined): [number, number] {
  const g = normalizeTrackGain(gain);
  const p = normalizeTrackPan(pan);
  const angle = (p + 1) * Math.PI / 4;
  const leftGain = Math.cos(angle) * Math.SQRT2;
  const rightGain = Math.sin(angle) * Math.SQRT2;
  return [left * g * leftGain, right * g * rightGain];
}
