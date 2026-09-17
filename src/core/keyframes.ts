import type { EffectParameter, EffectParameterValue, Keyframe } from '../types/editor';

export function evaluateEffectParameter(parameter: EffectParameter, timeSeconds: number): EffectParameterValue {
  const keyframes = sortedValidKeyframes(parameter.keyframes);
  if (keyframes.length === 0) return cloneEffectValue(parameter.value);
  if (timeSeconds <= keyframes[0].time) return cloneEffectValue(keyframes[0].value);
  if (timeSeconds >= keyframes[keyframes.length - 1].time) return cloneEffectValue(keyframes[keyframes.length - 1].value);

  let rightIndex = 1;
  while (rightIndex < keyframes.length && keyframes[rightIndex].time < timeSeconds) rightIndex += 1;
  const left = keyframes[rightIndex - 1];
  const right = keyframes[rightIndex];
  if (left.interpolation === 'hold') return cloneEffectValue(left.value);

  const span = Math.max(Number.EPSILON, right.time - left.time);
  const linear = clamp01((timeSeconds - left.time) / span);
  const amount = left.interpolation === 'bezier' ? smoothstep(linear) : linear;
  return interpolateEffectValue(left.value, right.value, amount);
}

export function sortedValidKeyframes(keyframes: Keyframe[] | undefined) {
  return keyframes?.filter(validKeyframe).slice().sort((a, b) => a.time - b.time) ?? [];
}

export function interpolateEffectValue(left: EffectParameterValue, right: EffectParameterValue, amount: number): EffectParameterValue {
  if (typeof left === 'number' && typeof right === 'number') return left + (right - left) * amount;
  if (Array.isArray(left) && Array.isArray(right) && left.length === right.length) {
    return left.map((value, index) => value + (right[index] - value) * amount);
  }
  return amount < 1 ? cloneEffectValue(left) : cloneEffectValue(right);
}

export function cloneEffectValue(value: EffectParameterValue): EffectParameterValue {
  return Array.isArray(value) ? [...value] : value;
}

function validKeyframe(keyframe: Keyframe) {
  return Number.isFinite(keyframe.time) && keyframe.time >= 0;
}

function smoothstep(value: number) {
  return value * value * (3 - 2 * value);
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}
