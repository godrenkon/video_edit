import type { EffectInstance } from '../types/editor';
import { resolveAudioEffects, type ResolvedAudioEffect } from './audioEffects';
import { measureAudioSamples, type AudioMeterReading } from './audioMeter';

type PreviewEffectNode =
  | { effectId: string; kind: 'gain'; node: GainNode }
  | { effectId: string; kind: 'pan'; node: StereoPannerNode }
  | { effectId: string; kind: 'high-pass' | 'low-pass'; node: BiquadFilterNode }
  | { effectId: string; kind: 'compressor'; node: DynamicsCompressorNode }
  | { effectId: string; kind: 'limiter'; node: DynamicsCompressorNode };

type PreviewGraphState = {
  context: AudioContext;
  source: MediaElementAudioSourceNode;
  nodes: PreviewEffectNode[];
  topology: string;
  connected: boolean;
  trackGain: GainNode;
  trackPan: StereoPannerNode | null;
};

let sharedContext: AudioContext | null = null;
let sharedOutput: { gain: GainNode; analyser: AnalyserNode; samples: Float32Array<ArrayBuffer> } | null = null;
const stateByElement = new WeakMap<HTMLMediaElement, PreviewGraphState>();

/**
 * Realtime Web Audio graph for preview playback.
 *
 * MediaElementAudioSourceNode may only be created once for a media element.
 * React StrictMode deliberately runs effect setup/cleanup twice in development,
 * so source nodes are cached by element and reconnected instead of recreated.
 * A single AudioContext is shared across active preview clips to keep resource
 * usage bounded. Offline export remains deterministic and independent.
 */
export class PreviewAudioGraph {
  private readonly state: PreviewGraphState;
  private detached = false;

  constructor(element: HTMLMediaElement) {
    const cached = stateByElement.get(element);
    if (cached) {
      this.state = cached;
      return;
    }

    const context = getSharedContext();
    const state: PreviewGraphState = {
      context,
      source: context.createMediaElementSource(element),
      nodes: [],
      topology: '',
      connected: false,
      trackGain: context.createGain(),
      trackPan: typeof context.createStereoPanner === 'function' ? context.createStereoPanner() : null,
    };
    stateByElement.set(element, state);
    this.state = state;
  }

  get stateName() {
    return this.state.context.state;
  }

  async resume() {
    if (this.detached || this.state.context.state === 'running') return;
    await this.state.context.resume();
  }

  setEffects(effects: EffectInstance[] | undefined, clipLocalTime: number) {
    if (this.detached) return;
    const resolved = resolveAudioEffects(effects ?? [], Math.max(0, clipLocalTime));
    const topology = resolved.map((effect) => `${effect.id}:${effect.kind}`).join('|');
    if (topology !== this.state.topology || !this.state.connected) this.rebuild(resolved, topology);
    else this.updateNodes(resolved);
  }

  setTrackMix(gain: number, pan: number) {
    if (this.detached) return;
    const now = this.state.context.currentTime;
    setAudioParam(this.state.trackGain.gain, Math.max(0, Math.min(4, Number.isFinite(gain) ? gain : 1)), now);
    if (this.state.trackPan) {
      setAudioParam(this.state.trackPan.pan, Math.max(-1, Math.min(1, Number.isFinite(pan) ? pan : 0)), now);
    }
  }

  detach() {
    if (this.detached) return;
    this.detached = true;
    disconnectState(this.state);
  }

  private rebuild(effects: ResolvedAudioEffect[], topology: string) {
    disconnectState(this.state);
    this.state.nodes = [];
    this.state.topology = topology;

    let previous: AudioNode = this.state.source;
    for (const effect of effects) {
      const item = createNode(this.state.context, effect);
      if (!item) continue;
      previous.connect(item.node);
      previous = item.node;
      this.state.nodes.push(item);
    }
    previous.connect(this.state.trackGain);
    if (this.state.trackPan) {
      this.state.trackGain.connect(this.state.trackPan);
      this.state.trackPan.connect(getSharedOutput(this.state.context).gain);
    } else {
      this.state.trackGain.connect(getSharedOutput(this.state.context).gain);
    }
    this.state.connected = true;
    this.updateNodes(effects);
  }

  private updateNodes(effects: ResolvedAudioEffect[]) {
    const byId = new Map(effects.map((effect) => [effect.id, effect]));
    const now = this.state.context.currentTime;
    for (const item of this.state.nodes) {
      const effect = byId.get(item.effectId);
      if (!effect || effect.kind !== item.kind) continue;
      if (item.kind === 'gain' && effect.kind === 'gain') {
        setAudioParam(item.node.gain, effect.gain, now);
      } else if (item.kind === 'pan' && effect.kind === 'pan') {
        setAudioParam(item.node.pan, effect.pan, now);
      } else if ((item.kind === 'high-pass' || item.kind === 'low-pass') && (effect.kind === 'high-pass' || effect.kind === 'low-pass')) {
        setAudioParam(item.node.frequency, effect.frequency, now);
      } else if (item.kind === 'compressor' && effect.kind === 'compressor') {
        setAudioParam(item.node.threshold, effect.thresholdDb, now);
        setAudioParam(item.node.ratio, effect.ratio, now);
        setAudioParam(item.node.attack, effect.attack, now);
        setAudioParam(item.node.release, effect.release, now);
      } else if (item.kind === 'limiter' && effect.kind === 'limiter') {
        setAudioParam(item.node.threshold, effect.ceilingDb, now);
        setAudioParam(item.node.knee, 0, now);
        setAudioParam(item.node.ratio, 20, now);
        setAudioParam(item.node.attack, 0, now);
        setAudioParam(item.node.release, 0.05, now);
      }
    }
  }
}

function getSharedContext() {
  if (sharedContext) return sharedContext;
  if (typeof AudioContext === 'undefined') throw new Error('Web Audio API is not available');
  sharedContext = new AudioContext({ latencyHint: 'interactive' });
  return sharedContext;
}

function getSharedOutput(context: AudioContext) {
  if (sharedOutput) return sharedOutput;
  const gain = context.createGain();
  const analyser = context.createAnalyser();
  analyser.fftSize = 1024;
  analyser.smoothingTimeConstant = 0.25;
  gain.connect(analyser);
  analyser.connect(context.destination);
  sharedOutput = {
    gain,
    analyser,
    samples: new Float32Array(new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT)),
  };
  return sharedOutput;
}

export function readPreviewAudioMeter(): AudioMeterReading {
  if (!sharedOutput) return measureAudioSamples([]);
  sharedOutput.analyser.getFloatTimeDomainData(sharedOutput.samples);
  return measureAudioSamples(sharedOutput.samples);
}

function createNode(context: AudioContext, effect: ResolvedAudioEffect): PreviewEffectNode | null {
  if (effect.kind === 'gain') {
    return { effectId: effect.id, kind: effect.kind, node: context.createGain() };
  }
  if (effect.kind === 'pan') {
    if (typeof context.createStereoPanner !== 'function') return null;
    return { effectId: effect.id, kind: effect.kind, node: context.createStereoPanner() };
  }
  if (effect.kind === 'high-pass' || effect.kind === 'low-pass') {
    const node = context.createBiquadFilter();
    node.type = effect.kind === 'high-pass' ? 'highpass' : 'lowpass';
    return { effectId: effect.id, kind: effect.kind, node };
  }
  if (effect.kind === 'compressor') {
    return { effectId: effect.id, kind: effect.kind, node: context.createDynamicsCompressor() };
  }
  if (effect.kind === 'limiter') {
    return { effectId: effect.id, kind: effect.kind, node: context.createDynamicsCompressor() };
  }
  return null;
}

function disconnectState(state: PreviewGraphState) {
  try { state.source.disconnect(); } catch { /* already disconnected */ }
  for (const item of state.nodes) {
    try { item.node.disconnect(); } catch { /* already disconnected */ }
  }
  try { state.trackGain.disconnect(); } catch { /* already disconnected */ }
  try { state.trackPan?.disconnect(); } catch { /* already disconnected */ }
  state.connected = false;
}

function setAudioParam(parameter: AudioParam, value: number, now: number) {
  if (!Number.isFinite(value)) return;
  parameter.cancelScheduledValues(now);
  parameter.setValueAtTime(value, now);
}
