import { evaluateEffectParameter } from '../core/keyframes';
import type { EffectInstance } from '../types/editor';

export type ResolvedAudioEffect =
  | { id: string; kind: 'gain'; gain: number }
  | { id: string; kind: 'pan'; pan: number }
  | { id: string; kind: 'high-pass'; frequency: number }
  | { id: string; kind: 'low-pass'; frequency: number }
  | { id: string; kind: 'compressor'; thresholdDb: number; ratio: number; attack: number; release: number }
  | { id: string; kind: 'limiter'; ceilingDb: number; ceiling: number };

interface StereoLowPassState { left: number; right: number }
interface StereoHighPassState { inLeft: number; inRight: number; outLeft: number; outRight: number }
interface CompressorState { gain: number }

export interface AudioEffectState {
  lowPass: Map<string, StereoLowPassState>;
  highPass: Map<string, StereoHighPassState>;
  compressor: Map<string, CompressorState>;
  lastTimelineTime: number | null;
}

const SUPPORTED_AUDIO_EFFECTS = new Set(['gain', 'pan', 'high-pass', 'low-pass', 'compressor', 'limiter']);

export function createAudioEffectState(): AudioEffectState {
  return {
    lowPass: new Map(),
    highPass: new Map(),
    compressor: new Map(),
    lastTimelineTime: null,
  };
}

export function resetAudioEffectState(state: AudioEffectState) {
  state.lowPass.clear();
  state.highPass.clear();
  state.compressor.clear();
  state.lastTimelineTime = null;
}

export function isAudioEffectSupported(kind: string) {
  return SUPPORTED_AUDIO_EFFECTS.has(kind);
}

export function resolveAudioEffects(effects: EffectInstance[], clipLocalTime: number): ResolvedAudioEffect[] {
  const result: ResolvedAudioEffect[] = [];
  for (const effect of effects) {
    if (!effect.enabled || !isAudioEffectSupported(effect.kind)) continue;
    if (effect.kind === 'gain') {
      const gainDb = effectNumber(effect, 'gainDb', clipLocalTime, 0, -60, 24);
      result.push({ id: effect.id, kind: 'gain', gain: 10 ** (gainDb / 20) });
    } else if (effect.kind === 'pan') {
      result.push({ id: effect.id, kind: 'pan', pan: effectNumber(effect, 'pan', clipLocalTime, 0, -1, 1) });
    } else if (effect.kind === 'high-pass') {
      result.push({ id: effect.id, kind: 'high-pass', frequency: effectNumber(effect, 'frequency', clipLocalTime, 80, 20, 20_000) });
    } else if (effect.kind === 'low-pass') {
      result.push({ id: effect.id, kind: 'low-pass', frequency: effectNumber(effect, 'frequency', clipLocalTime, 18_000, 20, 20_000) });
    } else if (effect.kind === 'compressor') {
      result.push({
        id: effect.id,
        kind: 'compressor',
        thresholdDb: effectNumber(effect, 'threshold', clipLocalTime, -24, -100, 0),
        ratio: effectNumber(effect, 'ratio', clipLocalTime, 4, 1, 20),
        attack: effectNumber(effect, 'attack', clipLocalTime, 0.003, 0, 1),
        release: effectNumber(effect, 'release', clipLocalTime, 0.25, 0, 1),
      });
    } else if (effect.kind === 'limiter') {
      const ceilingDb = effectNumber(effect, 'ceiling', clipLocalTime, -1, -24, 0);
      result.push({
        id: effect.id,
        kind: 'limiter',
        ceilingDb,
        ceiling: 10 ** (ceilingDb / 20),
      });
    }
  }
  return result;
}

export function processAudioEffects(
  left: number,
  right: number,
  effects: ResolvedAudioEffect[],
  sampleRate: number,
  state: AudioEffectState,
): [number, number] {
  let l = finite(left);
  let r = finite(right);
  const rate = Math.max(8_000, finite(sampleRate, 48_000));

  for (const effect of effects) {
    if (effect.kind === 'gain') {
      l *= effect.gain;
      r *= effect.gain;
    } else if (effect.kind === 'pan') {
      if (effect.pan > 0) l *= 1 - effect.pan;
      else if (effect.pan < 0) r *= 1 + effect.pan;
    } else if (effect.kind === 'low-pass') {
      const cutoff = clamp(effect.frequency, 20, rate * 0.49);
      const dt = 1 / rate;
      const rc = 1 / (Math.PI * 2 * cutoff);
      const alpha = dt / (rc + dt);
      const memory = state.lowPass.get(effect.id) ?? { left: l, right: r };
      memory.left += alpha * (l - memory.left);
      memory.right += alpha * (r - memory.right);
      l = memory.left;
      r = memory.right;
      state.lowPass.set(effect.id, memory);
    } else if (effect.kind === 'high-pass') {
      const cutoff = clamp(effect.frequency, 20, rate * 0.49);
      const dt = 1 / rate;
      const rc = 1 / (Math.PI * 2 * cutoff);
      const alpha = rc / (rc + dt);
      const memory = state.highPass.get(effect.id) ?? { inLeft: l, inRight: r, outLeft: 0, outRight: 0 };
      const nextLeft = alpha * (memory.outLeft + l - memory.inLeft);
      const nextRight = alpha * (memory.outRight + r - memory.inRight);
      memory.inLeft = l;
      memory.inRight = r;
      memory.outLeft = nextLeft;
      memory.outRight = nextRight;
      l = nextLeft;
      r = nextRight;
      state.highPass.set(effect.id, memory);
    } else if (effect.kind === 'compressor') {
      const peak = Math.max(Math.abs(l), Math.abs(r), 1e-12);
      const inputDb = 20 * Math.log10(peak);
      const overDb = Math.max(0, inputDb - effect.thresholdDb);
      const reductionDb = overDb - overDb / Math.max(1, effect.ratio);
      const targetGain = 10 ** (-reductionDb / 20);
      const memory = state.compressor.get(effect.id) ?? { gain: 1 };
      const time = targetGain < memory.gain ? effect.attack : effect.release;
      const coefficient = time <= 0 ? 0 : Math.exp(-1 / (Math.max(1e-5, time) * rate));
      memory.gain = targetGain + coefficient * (memory.gain - targetGain);
      l *= memory.gain;
      r *= memory.gain;
      state.compressor.set(effect.id, memory);
    } else if (effect.kind === 'limiter') {
      const peak = Math.max(Math.abs(l), Math.abs(r));
      if (peak > effect.ceiling && peak > 0) {
        const gain = effect.ceiling / peak;
        l *= gain;
        r *= gain;
      }
    }
  }

  return [finite(l), finite(r)];
}

function effectNumber(
  effect: EffectInstance,
  parameterId: string,
  timeSeconds: number,
  fallback: number,
  min: number,
  max: number,
) {
  const parameter = effect.parameters[parameterId];
  const value = parameter ? evaluateEffectParameter(parameter, timeSeconds) : fallback;
  return clamp(typeof value === 'number' ? value : fallback, min, max);
}

function finite(value: number, fallback = 0) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, finite(value, min)));
}
