import { evaluateEffectParameter } from '../core/keyframes';
import type { EffectInstance } from '../types/editor';

export type ResolvedAudioEffect =
  | { id: string; kind: 'gain'; gain: number }
  | { id: string; kind: 'pan'; pan: number }
  | { id: string; kind: 'high-pass'; frequency: number }
  | { id: string; kind: 'low-pass'; frequency: number }
  | { id: string; kind: 'compressor'; thresholdDb: number; ratio: number; attack: number; release: number }
  | { id: string; kind: 'limiter'; ceilingDb: number; ceiling: number }
  | { id: string; kind: 'gate-expander'; thresholdDb: number; ratio: number; rangeDb: number; attack: number; release: number }
  | { id: string; kind: 'de-esser'; frequency: number; thresholdDb: number; ratio: number; maxReductionDb: number; attack: number; release: number };

interface StereoLowPassState { left: number; right: number }
interface StereoHighPassState { inLeft: number; inRight: number; outLeft: number; outRight: number }
interface CompressorState { gain: number }
interface ExpanderState { gain: number }
interface DeEsserState { inLeft: number; inRight: number; outLeft: number; outRight: number; gain: number }

export interface AudioEffectState {
  lowPass: Map<string, StereoLowPassState>;
  highPass: Map<string, StereoHighPassState>;
  compressor: Map<string, CompressorState>;
  expander: Map<string, ExpanderState>;
  deEsser: Map<string, DeEsserState>;
  lastTimelineTime: number | null;
}

const SUPPORTED_AUDIO_EFFECTS = new Set(['gain', 'pan', 'high-pass', 'low-pass', 'compressor', 'limiter', 'gate-expander', 'de-esser']);

export function createAudioEffectState(): AudioEffectState {
  return {
    lowPass: new Map(),
    highPass: new Map(),
    compressor: new Map(),
    expander: new Map(),
    deEsser: new Map(),
    lastTimelineTime: null,
  };
}

export function resetAudioEffectState(state: AudioEffectState) {
  state.lowPass.clear();
  state.highPass.clear();
  state.compressor.clear();
  state.expander.clear();
  state.deEsser.clear();
  state.lastTimelineTime = null;
}

export function isAudioEffectSupported(kind: string) {
  return SUPPORTED_AUDIO_EFFECTS.has(kind);
}

export function isRealtimeAudioEffectSupported(kind: string) {
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
    } else if (effect.kind === 'gate-expander') {
      result.push({
        id: effect.id,
        kind: 'gate-expander',
        thresholdDb: effectNumber(effect, 'threshold', clipLocalTime, -45, -100, 0),
        ratio: effectNumber(effect, 'ratio', clipLocalTime, 4, 1, 20),
        rangeDb: effectNumber(effect, 'range', clipLocalTime, 60, 0, 100),
        attack: effectNumber(effect, 'attack', clipLocalTime, 0.005, 0, 1),
        release: effectNumber(effect, 'release', clipLocalTime, 0.08, 0, 2),
      });
    } else if (effect.kind === 'de-esser') {
      result.push({
        id: effect.id,
        kind: 'de-esser',
        frequency: effectNumber(effect, 'frequency', clipLocalTime, 6000, 2000, 14_000),
        thresholdDb: effectNumber(effect, 'threshold', clipLocalTime, -28, -60, 0),
        ratio: effectNumber(effect, 'ratio', clipLocalTime, 6, 1, 20),
        maxReductionDb: effectNumber(effect, 'maxReduction', clipLocalTime, 12, 0, 30),
        attack: effectNumber(effect, 'attack', clipLocalTime, 0.002, 0, 0.2),
        release: effectNumber(effect, 'release', clipLocalTime, 0.08, 0, 1),
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
    } else if (effect.kind === 'gate-expander') {
      const peak = Math.max(Math.abs(l), Math.abs(r), 1e-12);
      const inputDb = 20 * Math.log10(peak);
      const belowDb = Math.max(0, effect.thresholdDb - inputDb);
      const reductionDb = Math.min(effect.rangeDb, belowDb * Math.max(0, effect.ratio - 1));
      const targetGain = 10 ** (-reductionDb / 20);
      const memory = state.expander.get(effect.id) ?? { gain: targetGain };
      const time = targetGain > memory.gain ? effect.attack : effect.release;
      const coefficient = time <= 0 ? 0 : Math.exp(-1 / (Math.max(1e-5, time) * rate));
      memory.gain = targetGain + coefficient * (memory.gain - targetGain);
      l *= memory.gain;
      r *= memory.gain;
      state.expander.set(effect.id, memory);
    } else if (effect.kind === 'de-esser') {
      const cutoff = clamp(effect.frequency, 2000, rate * 0.45);
      const dt = 1 / rate;
      const rc = 1 / (Math.PI * 2 * cutoff);
      const alpha = rc / (rc + dt);
      const memory = state.deEsser.get(effect.id) ?? {
        inLeft: l,
        inRight: r,
        outLeft: 0,
        outRight: 0,
        gain: 1,
      };
      const highLeft = alpha * (memory.outLeft + l - memory.inLeft);
      const highRight = alpha * (memory.outRight + r - memory.inRight);
      memory.inLeft = l;
      memory.inRight = r;
      memory.outLeft = highLeft;
      memory.outRight = highRight;

      const detectorPeak = Math.max(Math.abs(highLeft), Math.abs(highRight), 1e-12);
      const detectorDb = 20 * Math.log10(detectorPeak);
      const overDb = Math.max(0, detectorDb - effect.thresholdDb);
      const reductionDb = Math.min(
        effect.maxReductionDb,
        overDb - overDb / Math.max(1, effect.ratio),
      );
      const targetGain = 10 ** (-reductionDb / 20);
      const time = targetGain < memory.gain ? effect.attack : effect.release;
      const coefficient = time <= 0 ? 0 : Math.exp(-1 / (Math.max(1e-5, time) * rate));
      memory.gain = targetGain + coefficient * (memory.gain - targetGain);

      l = (l - highLeft) + highLeft * memory.gain;
      r = (r - highRight) + highRight * memory.gain;
      state.deEsser.set(effect.id, memory);
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
