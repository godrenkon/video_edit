import { effectBoolean, effectNumber, effectString } from './effectEvaluation';
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

export interface ResolvedTonalRanges {
  shadows: number;
  midtones: number;
  highlights: number;
}

export interface ResolvedToneCurve {
  points: [number, number, number, number, number];
}

export interface ResolvedHueVsSat {
  adjustments: [number, number, number, number, number, number];
}

export interface ResolvedLumaKey {
  threshold: number;
  softness: number;
  invert: boolean;
}

export interface ResolvedHueShift {
  degrees: number;
}

export interface ResolvedPixelate {
  size: number;
}

export interface ResolvedGrain {
  amount: number;
  seed: number;
}

export function hasPixelEffects(effects: EffectInstance[] | undefined) {
  return Boolean(effects?.some((effect) => effect.enabled && (
    effect.kind === 'sharpen'
    || effect.kind === 'chroma-key'
    || effect.kind === 'levels'
    || effect.kind === 'lift-gamma-gain'
    || effect.kind === 'tonal-ranges'
    || effect.kind === 'tone-curve'
    || effect.kind === 'hue-vs-sat'
    || effect.kind === 'luma-key'
    || effect.kind === 'hue-shift'
    || effect.kind === 'pixelate'
    || effect.kind === 'grain'
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

export function resolveTonalRanges(effect: EffectInstance, timeSeconds: number): ResolvedTonalRanges {
  return {
    shadows: clamp(effectNumber(effect, 'shadows', timeSeconds, 0), -1, 1),
    midtones: clamp(effectNumber(effect, 'midtones', timeSeconds, 0), -1, 1),
    highlights: clamp(effectNumber(effect, 'highlights', timeSeconds, 0), -1, 1),
  };
}

export function resolveToneCurve(effect: EffectInstance, timeSeconds: number): ResolvedToneCurve {
  return {
    points: [
      clamp(effectNumber(effect, 'black', timeSeconds, 0), 0, 1),
      clamp(effectNumber(effect, 'shadows', timeSeconds, 0.25), 0, 1),
      clamp(effectNumber(effect, 'midtones', timeSeconds, 0.5), 0, 1),
      clamp(effectNumber(effect, 'highlights', timeSeconds, 0.75), 0, 1),
      clamp(effectNumber(effect, 'white', timeSeconds, 1), 0, 1),
    ],
  };
}

export function resolveHueVsSat(effect: EffectInstance, timeSeconds: number): ResolvedHueVsSat {
  return {
    adjustments: [
      clamp(effectNumber(effect, 'red', timeSeconds, 0), -1, 1),
      clamp(effectNumber(effect, 'yellow', timeSeconds, 0), -1, 1),
      clamp(effectNumber(effect, 'green', timeSeconds, 0), -1, 1),
      clamp(effectNumber(effect, 'cyan', timeSeconds, 0), -1, 1),
      clamp(effectNumber(effect, 'blue', timeSeconds, 0), -1, 1),
      clamp(effectNumber(effect, 'magenta', timeSeconds, 0), -1, 1),
    ],
  };
}

export function resolveLumaKey(effect: EffectInstance, timeSeconds: number): ResolvedLumaKey {
  return {
    threshold: clamp(effectNumber(effect, 'threshold', timeSeconds, 0.5), 0, 1),
    softness: clamp(effectNumber(effect, 'softness', timeSeconds, 0.1), 0, 0.5),
    invert: effectBoolean(effect, 'invert', timeSeconds, false),
  };
}

export function resolveHueShift(effect: EffectInstance, timeSeconds: number): ResolvedHueShift {
  return {
    degrees: clamp(effectNumber(effect, 'degrees', timeSeconds, 0), -180, 180),
  };
}

export function resolvePixelate(effect: EffectInstance, timeSeconds: number): ResolvedPixelate {
  return {
    size: Math.max(1, Math.round(clamp(effectNumber(effect, 'size', timeSeconds, 1), 1, 128))),
  };
}

export function resolveGrain(effect: EffectInstance, timeSeconds: number): ResolvedGrain {
  return {
    amount: clamp(effectNumber(effect, 'amount', timeSeconds, 0), 0, 1),
    seed: Math.round(clamp(effectNumber(effect, 'seed', timeSeconds, 1), 0, 10000)),
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
    else if (effect.kind === 'tonal-ranges') applyTonalRanges(image, resolveTonalRanges(effect, timeSeconds));
    else if (effect.kind === 'tone-curve') applyToneCurve(image, resolveToneCurve(effect, timeSeconds));
    else if (effect.kind === 'hue-vs-sat') applyHueVsSat(image, resolveHueVsSat(effect, timeSeconds));
    else if (effect.kind === 'luma-key') applyLumaKey(image, resolveLumaKey(effect, timeSeconds));
    else if (effect.kind === 'hue-shift') applyHueShift(image, resolveHueShift(effect, timeSeconds));
    else if (effect.kind === 'pixelate') applyPixelate(image, resolvePixelate(effect, timeSeconds));
    else if (effect.kind === 'grain') applyGrain(image, resolveGrain(effect, timeSeconds));
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

export function applyTonalRanges(image: ImageData, resolved: ResolvedTonalRanges) {
  const data = image.data;

  for (let index = 0; index < data.length; index += 4) {
    const r = data[index] / 255;
    const g = data[index + 1] / 255;
    const b = data[index + 2] / 255;
    const luma = clamp(r * 0.2126 + g * 0.7152 + b * 0.0722, 0, 1);
    const shadowWeight = (1 - luma) ** 2;
    const highlightWeight = luma ** 2;
    const midWeight = 4 * luma * (1 - luma);
    const delta = (
      resolved.shadows * shadowWeight * 0.45
      + resolved.midtones * midWeight * 0.28
      + resolved.highlights * highlightWeight * 0.45
    );

    data[index] = clampByte((r + delta) * 255);
    data[index + 1] = clampByte((g + delta) * 255);
    data[index + 2] = clampByte((b + delta) * 255);
  }
  return image;
}

export function applyToneCurve(image: ImageData, resolved: ResolvedToneCurve) {
  const data = image.data;
  const points = resolved.points;
  const segmentCount = points.length - 1;

  for (let index = 0; index < data.length; index += 4) {
    for (let channel = 0; channel < 3; channel += 1) {
      const value = clamp(data[index + channel] / 255, 0, 1);
      const scaled = value * segmentCount;
      const segment = Math.min(segmentCount - 1, Math.max(0, Math.floor(scaled)));
      const local = scaled - segment;
      const output = points[segment] + (points[segment + 1] - points[segment]) * local;
      data[index + channel] = clampByte(output * 255);
    }
  }
  return image;
}

export function applyHueVsSat(image: ImageData, resolved: ResolvedHueVsSat) {
  const adjustments = resolved.adjustments;
  if (adjustments.every((value) => Math.abs(value) <= 1e-9)) return image;

  const data = image.data;
  for (let index = 0; index < data.length; index += 4) {
    const r = data[index] / 255;
    const g = data[index + 1] / 255;
    const b = data[index + 2] / 255;
    const hsv = rgbToHsv(r, g, b);
    if (hsv.s <= 1e-9 || hsv.v <= 1e-9) continue;

    const scaledHue = hsv.h * adjustments.length;
    const lowerIndex = Math.floor(scaledHue) % adjustments.length;
    const upperIndex = (lowerIndex + 1) % adjustments.length;
    const fraction = scaledHue - Math.floor(scaledHue);
    const eased = fraction * fraction * (3 - 2 * fraction);
    const adjustment = adjustments[lowerIndex]
      + (adjustments[upperIndex] - adjustments[lowerIndex]) * eased;
    const saturation = clamp(hsv.s * (1 + adjustment), 0, 1);
    if (Math.abs(saturation - hsv.s) <= 1e-9) continue;

    const [nextR, nextG, nextB] = hsvToRgb(hsv.h, saturation, hsv.v);
    data[index] = clampByte(nextR * 255);
    data[index + 1] = clampByte(nextG * 255);
    data[index + 2] = clampByte(nextB * 255);
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

export function applyLumaKey(image: ImageData, resolved: ResolvedLumaKey) {
  const data = image.data;
  const halfSoftness = resolved.softness * 0.5;
  const low = resolved.threshold - halfSoftness;
  const high = resolved.threshold + halfSoftness;

  for (let index = 0; index < data.length; index += 4) {
    const luma = (data[index] * 0.2126 + data[index + 1] * 0.7152 + data[index + 2] * 0.0722) / 255;
    let keep = resolved.softness <= 1e-9
      ? (luma >= resolved.threshold ? 1 : 0)
      : smoothstep(low, high, luma);
    if (resolved.invert) keep = 1 - keep;
    data[index + 3] = clampByte(data[index + 3] * keep);
  }
  return image;
}

export function applyHueShift(image: ImageData, resolved: ResolvedHueShift) {
  if (Math.abs(resolved.degrees) <= 1e-9) return image;
  const shift = resolved.degrees / 360;
  const data = image.data;

  for (let index = 0; index < data.length; index += 4) {
    const hsv = rgbToHsv(data[index] / 255, data[index + 1] / 255, data[index + 2] / 255);
    if (hsv.s <= 1e-9) continue;
    const [r, g, b] = hsvToRgb(hsv.h + shift, hsv.s, hsv.v);
    data[index] = clampByte(r * 255);
    data[index + 1] = clampByte(g * 255);
    data[index + 2] = clampByte(b * 255);
  }
  return image;
}

export function applyPixelate(image: ImageData, resolved: ResolvedPixelate) {
  const block = Math.max(1, Math.round(resolved.size));
  if (block <= 1 || image.width <= 1 || image.height <= 1) return image;
  const { width, height, data } = image;

  for (let y = 0; y < height; y += block) {
    const yEnd = Math.min(height, y + block);
    for (let x = 0; x < width; x += block) {
      const xEnd = Math.min(width, x + block);
      let red = 0;
      let green = 0;
      let blue = 0;
      let alpha = 0;
      let count = 0;

      for (let sampleY = y; sampleY < yEnd; sampleY += 1) {
        for (let sampleX = x; sampleX < xEnd; sampleX += 1) {
          const sampleIndex = (sampleY * width + sampleX) * 4;
          red += data[sampleIndex];
          green += data[sampleIndex + 1];
          blue += data[sampleIndex + 2];
          alpha += data[sampleIndex + 3];
          count += 1;
        }
      }

      const averageRed = clampByte(red / Math.max(1, count));
      const averageGreen = clampByte(green / Math.max(1, count));
      const averageBlue = clampByte(blue / Math.max(1, count));
      const averageAlpha = clampByte(alpha / Math.max(1, count));

      for (let fillY = y; fillY < yEnd; fillY += 1) {
        for (let fillX = x; fillX < xEnd; fillX += 1) {
          const fillIndex = (fillY * width + fillX) * 4;
          data[fillIndex] = averageRed;
          data[fillIndex + 1] = averageGreen;
          data[fillIndex + 2] = averageBlue;
          data[fillIndex + 3] = averageAlpha;
        }
      }
    }
  }
  return image;
}

export function applyGrain(image: ImageData, resolved: ResolvedGrain) {
  if (resolved.amount <= 1e-9) return image;
  const data = image.data;
  const amplitude = resolved.amount * 64;

  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    const noise = deterministicSignedNoise(pixel, resolved.seed) * amplitude;
    data[index] = clampByte(data[index] + noise);
    data[index + 1] = clampByte(data[index + 1] + noise);
    data[index + 2] = clampByte(data[index + 2] + noise);
  }
  return image;
}

function deterministicSignedNoise(index: number, seed: number) {
  let value = (index + 1) ^ Math.imul(seed + 1, 0x9e3779b1);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return ((value >>> 0) / 0xffffffff) * 2 - 1;
}

function rgbToHsv(r: number, g: number, b: number) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const delta = max - min;
  if (delta <= 1e-12) return { h: 0, s: 0, v: max };

  let sector: number;
  if (max === r) sector = ((g - b) / delta) % 6;
  else if (max === g) sector = (b - r) / delta + 2;
  else sector = (r - g) / delta + 4;

  const h = ((sector / 6) % 1 + 1) % 1;
  const s = max <= 1e-12 ? 0 : delta / max;
  return { h, s, v: max };
}

function hsvToRgb(h: number, s: number, v: number): [number, number, number] {
  const hue = ((h % 1) + 1) % 1;
  const chroma = v * clamp(s, 0, 1);
  const sector = hue * 6;
  const x = chroma * (1 - Math.abs((sector % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;

  if (sector < 1) [r, g, b] = [chroma, x, 0];
  else if (sector < 2) [r, g, b] = [x, chroma, 0];
  else if (sector < 3) [r, g, b] = [0, chroma, x];
  else if (sector < 4) [r, g, b] = [0, x, chroma];
  else if (sector < 5) [r, g, b] = [x, 0, chroma];
  else [r, g, b] = [chroma, 0, x];

  const match = v - chroma;
  return [r + match, g + match, b + match];
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
