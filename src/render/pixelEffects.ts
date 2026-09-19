import { effectNumber, effectString } from './effectEvaluation';
import type { EffectInstance } from '../types/editor';

export interface ResolvedSharpen {
  amount: number;
}

export interface ResolvedChromaKey {
  color: [number, number, number];
  similarity: number;
  smoothness: number;
  spill: number;
}

export interface ResolvedLevels {
  inputBlack: number;
  inputWhite: number;
  gamma: number;
  outputBlack: number;
  outputWhite: number;
}

export interface ResolvedLiftGammaGain {
  lift: number;
  gamma: number;
  gain: number;
}

export function hasPixelEffects(effects: EffectInstance[] | undefined) {
  return Boolean(effects?.some((effect) => effect.enabled && (
    effect.kind === 'sharpen'
    || effect.kind === 'chroma-key'
    || effect.kind === 'levels'
    || effect.kind === 'lift-gamma-gain'
  )));
}

export function resolveSharpen(effect: EffectInstance, timeSeconds: number): ResolvedSharpen {
  return { amount: clamp(effectNumber(effect, 'amount', timeSeconds, 0), 0, 3) };
}

export function resolveChromaKey(effect: EffectInstance, timeSeconds: number): ResolvedChromaKey {
  return {
    color: parseHexColor(effectString(effect, 'color', timeSeconds, '#00ff00')),
    similarity: clamp(effectNumber(effect, 'similarity', timeSeconds, 0.35), 0, 1),
    smoothness: clamp(effectNumber(effect, 'smoothness', timeSeconds, 0.08), 0, 0.5),
    spill: clamp(effectNumber(effect, 'spill', timeSeconds, 0.5), 0, 1),
  };
}

export function resolveLiftGammaGain(effect: EffectInstance, timeSeconds: number): ResolvedLiftGammaGain {
  return {
    lift: clamp(effectNumber(effect, 'lift', timeSeconds, 0), -1, 1),
    gamma: clamp(effectNumber(effect, 'gamma', timeSeconds, 1), 0.1, 5),
    gain: clamp(effectNumber(effect, 'gain', timeSeconds, 1), 0, 4),
  };
}

export function resolveLevels(effect: EffectInstance, timeSeconds: number): ResolvedLevels {
  const inputBlack = clamp(effectNumber(effect, 'inputBlack', timeSeconds, 0), 0, 1);
  const inputWhiteRaw = clamp(effectNumber(effect, 'inputWhite', timeSeconds, 1), 0, 1);
  const inputWhite = Math.max(inputBlack + 1 / 255, inputWhiteRaw);
  const outputBlack = clamp(effectNumber(effect, 'outputBlack', timeSeconds, 0), 0, 1);
  const outputWhiteRaw = clamp(effectNumber(effect, 'outputWhite', timeSeconds, 1), 0, 1);
  const outputWhite = Math.max(outputBlack, outputWhiteRaw);
  return {
    inputBlack,
    inputWhite: Math.min(1, inputWhite),
    gamma: clamp(effectNumber(effect, 'gamma', timeSeconds, 1), 0.1, 5),
    outputBlack,
    outputWhite,
  };
}

export function applyPixelEffects(
  image: ImageData,
  effects: EffectInstance[] | undefined,
  timeSeconds: number,
) {
  if (!effects?.length) return image;
  for (const effect of effects) {
    if (!effect.enabled) continue;
    if (effect.kind === 'sharpen') applySharpen(image, resolveSharpen(effect, timeSeconds));
    else if (effect.kind === 'chroma-key') applyChromaKey(image, resolveChromaKey(effect, timeSeconds));
    else if (effect.kind === 'levels') applyLevels(image, resolveLevels(effect, timeSeconds));
    else if (effect.kind === 'lift-gamma-gain') applyLiftGammaGain(image, resolveLiftGammaGain(effect, timeSeconds));
  }
  return image;
}

export function applySharpen(image: ImageData, resolved: ResolvedSharpen) {
  if (resolved.amount <= 1e-6 || image.width < 2 || image.height < 2) return image;
  const source = new Uint8ClampedArray(image.data);
  const data = image.data;
  const width = image.width;
  const height = image.height;
  const strength = resolved.amount * 0.25;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = (y * width + x) * 4;
      const left = index - 4;
      const right = index + 4;
      const up = index - width * 4;
      const down = index + width * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        const value = source[index + channel] * (1 + 4 * strength)
          - strength * (
            source[left + channel]
            + source[right + channel]
            + source[up + channel]
            + source[down + channel]
          );
        data[index + channel] = clampByte(value);
      }
    }
  }
  return image;
}

export function applyLevels(image: ImageData, resolved: ResolvedLevels) {
  const data = image.data;
  const inputRange = Math.max(1 / 255, resolved.inputWhite - resolved.inputBlack);
  const outputRange = Math.max(0, resolved.outputWhite - resolved.outputBlack);
  const inverseGamma = 1 / Math.max(0.1, resolved.gamma);

  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const normalized = clamp((data[index + channel] / 255 - resolved.inputBlack) / inputRange, 0, 1);
      const corrected = normalized <= 0 ? 0 : normalized >= 1 ? 1 : normalized ** inverseGamma;
      data[index + channel] = clampByte((resolved.outputBlack + corrected * outputRange) * 255);
    }
  }
  return image;
}

export function applyLiftGammaGain(image: ImageData, resolved: ResolvedLiftGammaGain) {
  const data = image.data;
  const inverseGamma = 1 / Math.max(0.1, resolved.gamma);

  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const normalized = data[index + channel] / 255;
      const lifted = clamp(normalized + resolved.lift * (1 - normalized), 0, 1);
      const corrected = lifted <= 0 ? 0 : lifted >= 1 ? 1 : lifted ** inverseGamma;
      data[index + channel] = clampByte(corrected * resolved.gain * 255);
    }
  }
  return image;
}

export function applyChromaKey(image: ImageData, resolved: ResolvedChromaKey) {
  const data = image.data;
  const [keyR, keyG, keyB] = resolved.color;
  const inv255 = 1 / 255;
  const maxDistance = Math.sqrt(3);

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index];
    const g = data[index + 1];
    const b = data[index + 2];
    const distance = Math.sqrt(
      ((r - keyR) * inv255) ** 2
      + ((g - keyG) * inv255) ** 2
      + ((b - keyB) * inv255) ** 2,
    ) / maxDistance;

    const keep = resolved.smoothness <= 1e-6
      ? (distance <= resolved.similarity ? 0 : 1)
      : smoothstep(resolved.similarity, resolved.similarity + resolved.smoothness, distance);

    if (resolved.spill > 0 && keep < 1) {
      const edge = (1 - keep) * resolved.spill;
      const luma = r * 0.2126 + g * 0.7152 + b * 0.0722;
      data[index] = clampByte(r + (luma - r) * edge);
      data[index + 1] = clampByte(g + (luma - g) * edge);
      data[index + 2] = clampByte(b + (luma - b) * edge);
    }
    data[index + 3] = clampByte(data[index + 3] * keep);
  }
  return image;
}

function parseHexColor(value: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(value);
  if (!match) return [0, 255, 0];
  const raw = Number.parseInt(match[1], 16);
  return [(raw >> 16) & 255, (raw >> 8) & 255, raw & 255];
}

function smoothstep(edge0: number, edge1: number, value: number) {
  if (edge1 <= edge0) return value < edge0 ? 0 : 1;
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(Number.isFinite(value) ? value : 0)));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
