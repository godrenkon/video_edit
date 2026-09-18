import type { AudioBusId, AudioBusSettings, AudioDuckingSettings, Project, Track } from '../types/editor';

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


export interface AudioDuckingEnvelope {
  sourceBus: Exclude<AudioBusId, 'master'>;
  targetBus: Exclude<AudioBusId, 'master'>;
  reductionGain: number;
  attack: number;
  release: number;
  windows: Array<{ start: number; end: number }>;
}

export function normalizeAudioDucking(settings: AudioDuckingSettings | undefined): AudioDuckingSettings {
  const sourceBus = settings?.sourceBus ?? 'voice';
  const targetBus = settings?.targetBus ?? 'music';
  return {
    enabled: Boolean(settings?.enabled),
    sourceBus,
    targetBus: targetBus === sourceBus ? (sourceBus === 'music' ? 'sfx' : 'music') : targetBus,
    reductionDb: Math.max(-36, Math.min(0, Number.isFinite(settings?.reductionDb) ? settings!.reductionDb : -12)),
    attack: Math.max(0, Math.min(2, Number.isFinite(settings?.attack) ? settings!.attack : 0.08)),
    release: Math.max(0, Math.min(5, Number.isFinite(settings?.release) ? settings!.release : 0.35)),
  };
}

export function buildAudioDuckingEnvelope(project: Project): AudioDuckingEnvelope | null {
  const settings = normalizeAudioDucking(project.audioDucking);
  if (!settings.enabled) return null;
  const buses = normalizeAudioBuses(project.audioBuses);
  const byId = new Map(buses.map((bus) => [bus.id, bus]));
  const master = byId.get('master')!;
  const sourceBus = byId.get(settings.sourceBus)!;
  if (master.muted || sourceBus.muted) return null;

  const candidates = project.tracks.filter((track) => (track.kind === 'audio' || track.kind === 'video') && (track.busId ?? 'master') === settings.sourceBus);
  const hasSolo = project.tracks
    .filter((track) => track.kind === 'audio' || track.kind === 'video')
    .some((track) => track.solo);
  const windows = candidates
    .filter((track) => !track.muted && (!hasSolo || track.solo))
    .flatMap((track) => track.clips
      .filter((clip) => !clip.muted && Boolean(clip.assetId) && clip.duration > 0)
      .map((clip) => ({ start: clip.start, end: clip.start + clip.duration })))
    .sort((a, b) => a.start - b.start);

  return {
    sourceBus: settings.sourceBus,
    targetBus: settings.targetBus,
    reductionGain: dbToLinear(settings.reductionDb),
    attack: settings.attack,
    release: settings.release,
    windows: mergeWindows(windows),
  };
}

export function duckingGainAt(envelope: AudioDuckingEnvelope | null, timeSeconds: number, busId: AudioBusId | undefined) {
  if (!envelope || (busId ?? 'master') !== envelope.targetBus || envelope.windows.length === 0) return 1;
  const time = Math.max(0, Number.isFinite(timeSeconds) ? timeSeconds : 0);
  let gain = 1;
  for (const window of envelope.windows) {
    if (time >= window.start && time <= window.end) return envelope.reductionGain;
    if (envelope.attack > 0 && time >= window.start - envelope.attack && time < window.start) {
      const progress = (time - (window.start - envelope.attack)) / envelope.attack;
      gain = Math.min(gain, 1 + (envelope.reductionGain - 1) * progress);
    }
    if (envelope.release > 0 && time > window.end && time <= window.end + envelope.release) {
      const progress = (time - window.end) / envelope.release;
      gain = Math.min(gain, envelope.reductionGain + (1 - envelope.reductionGain) * progress);
    }
    if (window.start - envelope.attack > time && gain === 1) break;
  }
  return Math.max(envelope.reductionGain, Math.min(1, gain));
}

function mergeWindows(windows: Array<{ start: number; end: number }>) {
  const merged: Array<{ start: number; end: number }> = [];
  for (const window of windows) {
    const last = merged[merged.length - 1];
    if (last && window.start <= last.end) last.end = Math.max(last.end, window.end);
    else merged.push({ ...window });
  }
  return merged;
}
