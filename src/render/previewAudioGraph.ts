import type { EffectInstance } from '../types/editor';
import { resolveAudioEffects, type ResolvedAudioEffect } from './audioEffects';

type PreviewEffectNode = {
  effectId: string;
  kind: ResolvedAudioEffect['kind'];
  node: AudioNode;
};

/**
 * Web Audio graph used only for realtime preview. Offline export continues to
 * use the deterministic sample-by-sample DSP path in audioEffects.ts.
 *
 * The graph is rebuilt only when the enabled audio-effect topology changes;
 * parameter/keyframe changes update the existing nodes in place.
 */
export class PreviewAudioGraph {
  private readonly context: AudioContext;
  private readonly source: MediaElementAudioSourceNode;
  private nodes: PreviewEffectNode[] = [];
  private topology = '';
  private closed = false;

  constructor(element: HTMLMediaElement) {
    if (typeof AudioContext === 'undefined') throw new Error('Web Audio API is not available');
    this.context = new AudioContext({ latencyHint: 'interactive' });
    this.source = this.context.createMediaElementSource(element);
    this.source.connect(this.context.destination);
  }

  get state() {
    return this.context.state;
  }

  async resume() {
    if (this.closed || this.context.state === 'running') return;
    await this.context.resume();
  }

  async suspend() {
    if (this.closed || this.context.state !== 'running') return;
    await this.context.suspend();
  }

  setEffects(effects: EffectInstance[] | undefined, clipLocalTime: number) {
    if (this.closed) return;
    const resolved = resolveAudioEffects(effects ?? [], Math.max(0, clipLocalTime));
    const topology = resolved.map((effect) => `${effect.id}:${effect.kind}`).join('|');
    if (topology !== this.topology) this.rebuild(resolved, topology);
    else this.updateNodes(resolved);
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.disconnectAll();
    await this.context.close().catch(() => undefined);
  }

  private rebuild(effects: ResolvedAudioEffect[], topology: string) {
    this.disconnectAll();
    this.nodes = [];
    this.topology = topology;

    let previous: AudioNode = this.source;
    for (const effect of effects) {
      const node = this.createNode(effect);
      if (!node) continue;
      previous.connect(node);
      previous = node;
      this.nodes.push({ effectId: effect.id, kind: effect.kind, node });
    }
    previous.connect(this.context.destination);
    this.updateNodes(effects);
  }

  private createNode(effect: ResolvedAudioEffect): AudioNode | null {
    if (effect.kind === 'gain') return this.context.createGain();
    if (effect.kind === 'pan') {
      return typeof this.context.createStereoPanner === 'function' ? this.context.createStereoPanner() : null;
    }
    if (effect.kind === 'high-pass' || effect.kind === 'low-pass') {
      const filter = this.context.createBiquadFilter();
      filter.type = effect.kind === 'high-pass' ? 'highpass' : 'lowpass';
      return filter;
    }
    if (effect.kind === 'compressor') return this.context.createDynamicsCompressor();
    return null;
  }

  private updateNodes(effects: ResolvedAudioEffect[]) {
    const byId = new Map(effects.map((effect) => [effect.id, effect]));
    const now = this.context.currentTime;
    for (const item of this.nodes) {
      const effect = byId.get(item.effectId);
      if (!effect || effect.kind !== item.kind) continue;
      if (effect.kind === 'gain' && item.node instanceof GainNode) {
        setAudioParam(item.node.gain, effect.gain, now);
      } else if (effect.kind === 'pan' && item.node instanceof StereoPannerNode) {
        setAudioParam(item.node.pan, effect.pan, now);
      } else if ((effect.kind === 'high-pass' || effect.kind === 'low-pass') && item.node instanceof BiquadFilterNode) {
        setAudioParam(item.node.frequency, effect.frequency, now);
      } else if (effect.kind === 'compressor' && item.node instanceof DynamicsCompressorNode) {
        setAudioParam(item.node.threshold, effect.thresholdDb, now);
        setAudioParam(item.node.ratio, effect.ratio, now);
        setAudioParam(item.node.attack, effect.attack, now);
        setAudioParam(item.node.release, effect.release, now);
      }
    }
  }

  private disconnectAll() {
    try { this.source.disconnect(); } catch { /* already disconnected */ }
    for (const item of this.nodes) {
      try { item.node.disconnect(); } catch { /* already disconnected */ }
    }
  }
}

function setAudioParam(parameter: AudioParam, value: number, now: number) {
  if (!Number.isFinite(value)) return;
  parameter.cancelScheduledValues(now);
  parameter.setValueAtTime(value, now);
}
