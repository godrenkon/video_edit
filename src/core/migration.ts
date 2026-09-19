import type { AssetBin, AudioBusId, AudioBusSettings, AudioDuckingSettings, Clip, ClipTransition, Project, ProjectExportSettings, Track } from '../types/editor';
import { sanitizeTranscriptDocument } from './transcript';

const CURRENT_PROJECT_VERSION = 2 as const;

export function migrateProject(input: unknown): Project {
  if (!isRecord(input)) throw new Error('Project is not an object');

  const version = Number(input.version ?? 1);
  if (version !== 1 && version !== 2) {
    throw new Error(`Unsupported project version: ${version}`);
  }

  const tracksRaw = Array.isArray(input.tracks) ? input.tracks : [];
  const assetsRaw = Array.isArray(input.assets) ? input.assets : [];
  const assetBins = migrateAssetBins(input.assetBins);
  const validAssetBinIds = new Set(assetBins.map((bin) => bin.id));

  const project: Project = {
    version: CURRENT_PROJECT_VERSION,
    id: stringValue(input.id, 'project_unknown'),
    name: stringValue(input.name, '無題のプロジェクト'),
    width: finiteNumber(input.width, 1920, 1),
    height: finiteNumber(input.height, 1080, 1),
    fps: finiteNumber(input.fps, 30, 1, 240),
    background: stringValue(input.background, '#000000'),
    duration: finiteNumber(input.duration, 30, 0.1),
    createdAt: stringValue(input.createdAt, new Date().toISOString()),
    updatedAt: stringValue(input.updatedAt, new Date().toISOString()),
    assets: assetsRaw.filter(isRecord).map((asset, index) => ({
      id: stringValue(asset.id, `asset_migrated_${index}`),
      name: stringValue(asset.name, `Asset ${index + 1}`),
      kind: asset.kind === 'audio' || asset.kind === 'image' ? asset.kind : 'video',
      mime: stringValue(asset.mime, 'application/octet-stream'),
      size: finiteNumber(asset.size, 0, 0),
      duration: finiteNumber(asset.duration, 0, 0),
      width: optionalFiniteNumber(asset.width),
      height: optionalFiniteNumber(asset.height),
      storageName: stringValue(asset.storageName, `missing_${index}`),
      proxyStorageName: optionalString(asset.proxyStorageName),
      hash: optionalString(asset.hash),
      tags: Array.isArray(asset.tags) ? asset.tags.filter((v): v is string => typeof v === 'string') : undefined,
      rating: optionalClampedNumber(asset.rating, 0, 5),
      favorite: asset.favorite === undefined ? undefined : Boolean(asset.favorite),
      notes: optionalString(asset.notes),
      binId: (() => {
        const binId = optionalString(asset.binId);
        return binId && validAssetBinIds.has(binId) ? binId : undefined;
      })(),
    })),
    assetBins,
    tracks: tracksRaw.filter(isRecord).map(migrateTrack),
    markers: Array.isArray(input.markers)
      ? input.markers.filter(isRecord).map((marker, index) => ({
          id: stringValue(marker.id, `marker_migrated_${index}`),
          time: finiteNumber(marker.time, 0, 0),
          duration: optionalFiniteNumber(marker.duration),
          name: stringValue(marker.name, `Marker ${index + 1}`),
          color: optionalString(marker.color),
          note: optionalString(marker.note),
        }))
      : [],
    inPoint: optionalFiniteNumber(input.inPoint),
    outPoint: optionalFiniteNumber(input.outPoint),
    exportSettings: migrateExportSettings(input.exportSettings),
    audioBuses: migrateAudioBuses(input.audioBuses),
    audioDucking: migrateAudioDucking(input.audioDucking),
    transcript: sanitizeTranscriptDocument(input.transcript),
  };

  return project;
}

function migrateAssetBins(value: unknown): AssetBin[] {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set<string>();
  const seenNames = new Set<string>();
  const result: AssetBin[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const item = value[index];
    if (!isRecord(item)) continue;
    const id = stringValue(item.id, `asset_bin_migrated_${index}`);
    const name = stringValue(item.name, `Bin ${index + 1}`).trim().replace(/\s+/g, ' ').slice(0, 80);
    const nameKey = name.toLocaleLowerCase();
    if (seenIds.has(id) || seenNames.has(nameKey)) continue;
    seenIds.add(id);
    seenNames.add(nameKey);
    result.push({ id, name });
  }
  return result;
}

function migrateTrack(track: Record<string, unknown>, index: number): Track {
  const rawKind = track.kind;
  const kind: Track['kind'] = rawKind === 'audio' || rawKind === 'overlay' || rawKind === 'subtitle'
    ? rawKind
    : 'video';

  return {
    id: stringValue(track.id, `track_migrated_${index}`),
    name: stringValue(track.name, `Track ${index + 1}`),
    kind,
    muted: Boolean(track.muted),
    locked: Boolean(track.locked),
    solo: Boolean(track.solo),
    visible: track.visible === undefined ? true : Boolean(track.visible),
    gain: finiteNumber(track.gain, 1, 0, 4),
    pan: finiteNumber(track.pan, 0, -1, 1),
    busId: migrateAudioBusId(track.busId),
    clips: Array.isArray(track.clips)
      ? track.clips.filter(isRecord).map((clip, clipIndex) => migrateClip(clip, clipIndex))
      : [],
  };
}

function migrateClip(clip: Record<string, unknown>, index: number): Clip {
  const transform = isRecord(clip.transform) ? clip.transform : {};
  const rawKind = clip.kind;
  const allowedKinds: Clip['kind'][] = ['asset', 'zundamon', 'text', 'shape', 'subtitle', 'generator'];
  const kind: Clip['kind'] = allowedKinds.includes(rawKind as Clip['kind']) ? rawKind as Clip['kind'] : 'asset';
  const duration = finiteNumber(clip.duration, 0.1, 0.1);

  return {
    ...(clip as unknown as Clip),
    id: stringValue(clip.id, `clip_migrated_${index}`),
    kind,
    name: stringValue(clip.name, `Clip ${index + 1}`),
    start: finiteNumber(clip.start, 0, 0),
    duration,
    inPoint: finiteNumber(clip.inPoint, 0, 0),
    volume: finiteNumber(clip.volume, 1, 0),
    muted: Boolean(clip.muted),
    fadeIn: optionalClampedNumber(clip.fadeIn, 0, duration),
    fadeOut: optionalClampedNumber(clip.fadeOut, 0, duration),
    freezeFrameAt: optionalClampedNumber(clip.freezeFrameAt, 0, Number.MAX_SAFE_INTEGER),
    transitionIn: migrateTransition(clip.transitionIn, duration),
    transitionOut: migrateTransition(clip.transitionOut, duration),
    transform: {
      x: finiteNumber(transform.x, 0),
      y: finiteNumber(transform.y, 0),
      scale: finiteNumber(transform.scale, 1, 0),
      rotation: finiteNumber(transform.rotation, 0),
      opacity: finiteNumber(transform.opacity, 1, 0, 1),
      anchorX: optionalFiniteNumber(transform.anchorX),
      anchorY: optionalFiniteNumber(transform.anchorY),
    },
  };
}

function migrateTransition(value: unknown, clipDuration: number): ClipTransition | undefined {
  if (!isRecord(value)) return undefined;
  const kind = value.kind;
  if (
    kind !== 'dissolve'
    && kind !== 'dip-black'
    && kind !== 'slide-left'
    && kind !== 'slide-right'
    && kind !== 'slide-up'
    && kind !== 'slide-down'
    && kind !== 'wipe-left'
    && kind !== 'wipe-right'
    && kind !== 'wipe-up'
    && kind !== 'wipe-down'
  ) return undefined;
  const duration = optionalClampedNumber(value.duration, 0, clipDuration);
  return duration && duration > 0 ? { kind, duration } : undefined;
}

function migrateAudioBusId(value: unknown): AudioBusId | undefined {
  return value === 'master' || value === 'voice' || value === 'music' || value === 'sfx'
    ? value
    : undefined;
}

function migrateAudioBuses(value: unknown): AudioBusSettings[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const seen = new Set<AudioBusId>();
  const result: AudioBusSettings[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    const id = migrateAudioBusId(item.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    result.push({
      id,
      gain: finiteNumber(item.gain, 1, 0, 4),
      muted: Boolean(item.muted),
    });
  }
  return result.length ? result : undefined;
}

function migrateAudioDucking(value: unknown): AudioDuckingSettings | undefined {
  if (!isRecord(value)) return undefined;
  const sourceBus = migrateAudioBusId(value.sourceBus);
  const targetBus = migrateAudioBusId(value.targetBus);
  if (!sourceBus || sourceBus === 'master' || !targetBus || targetBus === 'master' || sourceBus === targetBus) return undefined;
  return {
    enabled: Boolean(value.enabled),
    sourceBus,
    targetBus,
    reductionDb: finiteNumber(value.reductionDb, -12, -36, 0),
    attack: finiteNumber(value.attack, 0.08, 0, 2),
    release: finiteNumber(value.release, 0.35, 0, 5),
  };
}

function migrateExportSettings(value: unknown): ProjectExportSettings | undefined {
  if (!isRecord(value)) return undefined;
  const container = value.container === 'mp4' || value.container === 'webm' || value.container === 'auto'
    ? value.container
    : undefined;
  const quality = value.quality === 'compact' || value.quality === 'balanced' || value.quality === 'high'
    ? value.quality
    : undefined;
  const outputHeight = optionalClampedNumber(value.outputHeight, 16, 8192);
  const includeAudio = typeof value.includeAudio === 'boolean' ? value.includeAudio : undefined;
  if (!container && !quality && outputHeight === undefined && includeAudio === undefined) return undefined;
  return { container, quality, outputHeight, includeAudio };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown, fallback: string) {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function optionalString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function finiteNumber(value: unknown, fallback: number, min = -Infinity, max = Infinity) {
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function optionalFiniteNumber(value: unknown) {
  if (value === undefined || value === null || value === '') return undefined;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function optionalClampedNumber(value: unknown, min: number, max: number) {
  const n = optionalFiniteNumber(value);
  return n === undefined ? undefined : Math.min(max, Math.max(min, n));
}
