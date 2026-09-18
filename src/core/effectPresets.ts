import { uid } from './project';
import type { EffectInstance, EffectParameterValue } from '../types/editor';

export interface EffectPreset {
  id: string;
  name: string;
  createdAt: string;
  effects: EffectInstance[];
}

const STORAGE_KEY = 'suiram-video-edit:effect-presets:v1';
const MAX_PRESETS = 100;

export function createEffectPreset(name: string, effects: EffectInstance[], now = new Date()) : EffectPreset {
  const normalized = normalizePresetName(name);
  if (!normalized) throw new Error('Preset name is required');
  return {
    id: uid('preset'),
    name: normalized,
    createdAt: now.toISOString(),
    effects: cloneEffects(effects, false),
  };
}

export function instantiatePresetEffects(preset: EffectPreset) {
  return cloneEffects(preset.effects, true);
}

export function parseEffectPresets(raw: string | null): EffectPreset[] {
  if (!raw) return [];
  try {
    const decoded: unknown = JSON.parse(raw);
    if (!Array.isArray(decoded)) return [];
    return decoded
      .map(parsePreset)
      .filter((preset): preset is EffectPreset => Boolean(preset))
      .slice(0, MAX_PRESETS);
  } catch {
    return [];
  }
}

export function serializeEffectPresets(presets: EffectPreset[]) {
  return JSON.stringify(presets.slice(0, MAX_PRESETS));
}

export function loadEffectPresets(storage: Pick<Storage, 'getItem'> | null = browserStorage()) {
  if (!storage) return [];
  try {
    return parseEffectPresets(storage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveEffectPresets(
  presets: EffectPreset[],
  storage: Pick<Storage, 'setItem'> | null = browserStorage(),
) {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, serializeEffectPresets(presets));
  } catch {
    // Presets are a convenience layer. A storage quota/privacy failure must not break editing.
  }
}

export function normalizePresetName(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 80);
}

function parsePreset(value: unknown): EffectPreset | null {
  if (!isRecord(value)) return null;
  const name = normalizePresetName(typeof value.name === 'string' ? value.name : '');
  if (!name || typeof value.id !== 'string' || !Array.isArray(value.effects)) return null;
  const effects = value.effects.map(parseEffect).filter((effect): effect is EffectInstance => Boolean(effect));
  return {
    id: value.id.slice(0, 160),
    name,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    effects,
  };
}

function parseEffect(value: unknown): EffectInstance | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.kind !== 'string' || !isRecord(value.parameters)) return null;
  const parameters = Object.fromEntries(
    Object.entries(value.parameters)
      .map(([key, parameter]) => [key, parseParameter(parameter)] as const)
      .filter((entry): entry is [string, NonNullable<ReturnType<typeof parseParameter>>] => Boolean(entry[1])),
  );
  return {
    id: value.id,
    kind: value.kind,
    enabled: value.enabled !== false,
    parameters,
    maskIds: Array.isArray(value.maskIds) ? value.maskIds.filter((id): id is string => typeof id === 'string') : undefined,
  };
}

function parseParameter(value: unknown) {
  if (!isRecord(value) || !isParameterValue(value.value)) return null;
  const keyframes = Array.isArray(value.keyframes)
    ? value.keyframes.flatMap((keyframe) => {
        if (!isRecord(keyframe) || typeof keyframe.id !== 'string' || !Number.isFinite(keyframe.time) || !isParameterValue(keyframe.value)) return [];
        const interpolation = keyframe.interpolation === 'hold' || keyframe.interpolation === 'bezier' ? keyframe.interpolation : 'linear';
        return [{
          id: keyframe.id,
          time: Math.max(0, Number(keyframe.time)),
          value: cloneValue(keyframe.value),
          interpolation,
          inTangent: parseTangent(keyframe.inTangent),
          outTangent: parseTangent(keyframe.outTangent),
        }];
      })
    : undefined;

  return {
    value: cloneValue(value.value),
    keyframes: keyframes?.length ? keyframes.sort((a, b) => a.time - b.time) : undefined,
  };
}

function cloneEffects(effects: EffectInstance[], freshIds: boolean): EffectInstance[] {
  return effects.map((effect) => ({
    ...effect,
    id: freshIds ? uid('fx') : effect.id,
    parameters: Object.fromEntries(Object.entries(effect.parameters).map(([key, parameter]) => [
      key,
      {
        ...parameter,
        value: cloneValue(parameter.value),
        keyframes: parameter.keyframes?.map((keyframe) => ({
          ...keyframe,
          id: freshIds ? uid('kf') : keyframe.id,
          value: cloneValue(keyframe.value),
          inTangent: keyframe.inTangent ? [...keyframe.inTangent] as [number, number] : undefined,
          outTangent: keyframe.outTangent ? [...keyframe.outTangent] as [number, number] : undefined,
        })),
      },
    ])),
    maskIds: effect.maskIds ? [...effect.maskIds] : undefined,
  }));
}

function parseTangent(value: unknown): [number, number] | undefined {
  if (!Array.isArray(value) || value.length !== 2 || !value.every((item) => typeof item === 'number' && Number.isFinite(item))) return undefined;
  return [value[0], value[1]];
}

function isParameterValue(value: unknown): value is EffectParameterValue {
  return typeof value === 'number' && Number.isFinite(value)
    || typeof value === 'string'
    || typeof value === 'boolean'
    || Array.isArray(value) && value.every((item) => typeof item === 'number' && Number.isFinite(item));
}

function cloneValue(value: EffectParameterValue): EffectParameterValue {
  return Array.isArray(value) ? [...value] : value;
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
