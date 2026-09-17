import { evaluateEffectParameter } from '../core/keyframes';
import type { EffectInstance } from '../types/editor';

export { evaluateEffectParameter } from '../core/keyframes';

const CANVAS_FILTER_EFFECTS = new Set([
  'brightness-contrast',
  'exposure',
  'saturation',
  'blur',
  'drop-shadow',
]);

export function effectNumber(effect: EffectInstance, parameterId: string, timeSeconds: number, fallback: number) {
  const parameter = effect.parameters[parameterId];
  if (!parameter) return fallback;
  const value = evaluateEffectParameter(parameter, timeSeconds);
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function effectString(effect: EffectInstance, parameterId: string, timeSeconds: number, fallback: string) {
  const parameter = effect.parameters[parameterId];
  if (!parameter) return fallback;
  const value = evaluateEffectParameter(parameter, timeSeconds);
  return typeof value === 'string' ? value : fallback;
}

export function isCanvasFilterEffectSupported(kind: string) {
  return CANVAS_FILTER_EFFECTS.has(kind);
}

/**
 * Returns one filter expression that is valid for both CanvasRenderingContext2D
 * and CSS `filter`, keeping Preview and deterministic export semantics aligned.
 */
export function canvasFilterForEffects(effects: EffectInstance[], clipLocalTime: number) {
  const filters: string[] = [];

  for (const effect of effects) {
    if (!effect.enabled) continue;
    if (effect.kind === 'brightness-contrast') {
      const brightness = Math.max(0, 1 + effectNumber(effect, 'brightness', clipLocalTime, 0));
      const contrast = Math.max(0, effectNumber(effect, 'contrast', clipLocalTime, 1));
      filters.push(`brightness(${format(brightness)})`, `contrast(${format(contrast)})`);
    } else if (effect.kind === 'exposure') {
      const exposure = clamp(effectNumber(effect, 'exposure', clipLocalTime, 0), -5, 5);
      const offset = clamp(effectNumber(effect, 'offset', clipLocalTime, 0), -1, 1);
      const multiplier = Math.max(0, 2 ** exposure * (1 + offset * 0.5));
      filters.push(`brightness(${format(multiplier)})`);
    } else if (effect.kind === 'saturation') {
      filters.push(`saturate(${format(Math.max(0, effectNumber(effect, 'saturation', clipLocalTime, 1)))})`);
    } else if (effect.kind === 'blur') {
      filters.push(`blur(${format(Math.max(0, effectNumber(effect, 'radius', clipLocalTime, 0)))}px)`);
    } else if (effect.kind === 'drop-shadow') {
      const distance = Math.max(0, effectNumber(effect, 'distance', clipLocalTime, 16));
      const angle = effectNumber(effect, 'angle', clipLocalTime, 45) * Math.PI / 180;
      const x = Math.cos(angle) * distance;
      const y = Math.sin(angle) * distance;
      const blur = Math.max(0, effectNumber(effect, 'blur', clipLocalTime, 12));
      const opacity = clamp01(effectNumber(effect, 'opacity', clipLocalTime, 0.5));
      const color = withAlpha(effectString(effect, 'color', clipLocalTime, '#000000'), opacity);
      filters.push(`drop-shadow(${format(x)}px ${format(y)}px ${format(blur)}px ${color})`);
    }
  }

  return filters.length ? filters.join(' ') : 'none';
}

function withAlpha(color: string, alpha: number) {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (!match) return color;
  const raw = Number.parseInt(match[1], 16);
  const red = (raw >> 16) & 0xff;
  const green = (raw >> 8) & 0xff;
  const blue = raw & 0xff;
  return `rgba(${red},${green},${blue},${format(alpha)})`;
}

function format(value: number) {
  return Number(value.toFixed(5)).toString();
}

function clamp01(value: number) {
  return clamp(value, 0, 1);
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
