import type { AssetMeta } from '../types/editor';

export interface ZundamonCharacterPreset {
  id: string;
  name: string;
  createdAt: string;
  assets: {
    closed?: AssetRef;
    half?: AssetRef;
    open?: AssetRef;
    blink?: AssetRef;
    vowels?: Partial<Record<'a' | 'i' | 'u' | 'e' | 'o', AssetRef>>;
  };
  blinkEvery: number;
  bobAmount: number;
  bobSpeed: number;
}

interface AssetRef {
  id: string;
  name: string;
}

export interface ZundamonCharacterSelection {
  closed: string;
  half: string;
  open: string;
  blink: string;
  vowelA: string;
  vowelI: string;
  vowelU: string;
  vowelE: string;
  vowelO: string;
  blinkEvery: number;
  bobAmount: number;
  bobSpeed: number;
}

const STORAGE_KEY = 'suiram-video-edit:zundamon-character-presets:v1';
const MAX_PRESETS = 32;

export function createZundamonCharacterPreset(
  name: string,
  selection: ZundamonCharacterSelection,
  assets: AssetMeta[],
  now = new Date(),
): ZundamonCharacterPreset {
  const safeName = normalizeZundamonPresetName(name);
  if (!safeName) throw new Error('Preset name is required');
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const ref = (id: string): AssetRef | undefined => {
    const asset = byId.get(id);
    return asset ? { id: asset.id, name: asset.name } : undefined;
  };
  return {
    id: crypto.randomUUID(),
    name: safeName,
    createdAt: now.toISOString(),
    assets: {
      closed: ref(selection.closed),
      half: ref(selection.half),
      open: ref(selection.open),
      blink: ref(selection.blink),
      vowels: {
        ...(ref(selection.vowelA) ? { a: ref(selection.vowelA) } : {}),
        ...(ref(selection.vowelI) ? { i: ref(selection.vowelI) } : {}),
        ...(ref(selection.vowelU) ? { u: ref(selection.vowelU) } : {}),
        ...(ref(selection.vowelE) ? { e: ref(selection.vowelE) } : {}),
        ...(ref(selection.vowelO) ? { o: ref(selection.vowelO) } : {}),
      },
    },
    blinkEvery: clamp(selection.blinkEvery, 1.5, 10, 4),
    bobAmount: clamp(selection.bobAmount, 0, 100, 8),
    bobSpeed: clamp(selection.bobSpeed, 0.1, 3, 0.7),
  };
}

export function resolveZundamonCharacterPreset(
  preset: ZundamonCharacterPreset,
  assets: AssetMeta[],
): ZundamonCharacterSelection {
  const images = assets.filter((asset) => asset.kind === 'image');
  const resolve = (ref: AssetRef | undefined) => {
    if (!ref) return '';
    return images.find((asset) => asset.id === ref.id)?.id
      ?? images.find((asset) => asset.name === ref.name)?.id
      ?? '';
  };
  return {
    closed: resolve(preset.assets.closed),
    half: resolve(preset.assets.half),
    open: resolve(preset.assets.open),
    blink: resolve(preset.assets.blink),
    vowelA: resolve(preset.assets.vowels?.a),
    vowelI: resolve(preset.assets.vowels?.i),
    vowelU: resolve(preset.assets.vowels?.u),
    vowelE: resolve(preset.assets.vowels?.e),
    vowelO: resolve(preset.assets.vowels?.o),
    blinkEvery: preset.blinkEvery,
    bobAmount: preset.bobAmount,
    bobSpeed: preset.bobSpeed,
  };
}

export function loadZundamonCharacterPresets(storage: Pick<Storage, 'getItem'> | null = browserStorage()) {
  if (!storage) return [];
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map(parsePreset).filter((item): item is ZundamonCharacterPreset => Boolean(item)).slice(0, MAX_PRESETS);
  } catch {
    return [];
  }
}

export function saveZundamonCharacterPresets(
  presets: ZundamonCharacterPreset[],
  storage: Pick<Storage, 'setItem'> | null = browserStorage(),
) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(presets.slice(0, MAX_PRESETS)));
    return true;
  } catch {
    return false;
  }
}

export function normalizeZundamonPresetName(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 80);
}

function parsePreset(value: unknown): ZundamonCharacterPreset | null {
  if (!isRecord(value) || typeof value.id !== 'string') return null;
  const name = normalizeZundamonPresetName(typeof value.name === 'string' ? value.name : '');
  if (!name) return null;
  const assets = isRecord(value.assets) ? value.assets : {};
  const vowels = isRecord(assets.vowels) ? assets.vowels : {};
  return {
    id: value.id.slice(0, 160),
    name,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    assets: {
      closed: parseAssetRef(assets.closed),
      half: parseAssetRef(assets.half),
      open: parseAssetRef(assets.open),
      blink: parseAssetRef(assets.blink),
      vowels: {
        a: parseAssetRef(vowels.a),
        i: parseAssetRef(vowels.i),
        u: parseAssetRef(vowels.u),
        e: parseAssetRef(vowels.e),
        o: parseAssetRef(vowels.o),
      },
    },
    blinkEvery: clamp(value.blinkEvery, 1.5, 10, 4),
    bobAmount: clamp(value.bobAmount, 0, 100, 8),
    bobSpeed: clamp(value.bobSpeed, 0.1, 3, 0.7),
  };
}

function parseAssetRef(value: unknown): AssetRef | undefined {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.name !== 'string') return undefined;
  return { id: value.id.slice(0, 200), name: value.name.slice(0, 500) };
}

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, numeric));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
