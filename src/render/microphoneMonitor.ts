export class MicrophoneMonitor {
  private context: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private gainNode: GainNode | null = null;

  async attach(stream: MediaStream, gain = 0.35) {
    await this.close();
    const AudioContextCtor = window.AudioContext
      ?? (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextCtor) throw new Error('Web Audio API is unavailable');

    const context = new AudioContextCtor({ latencyHint: 'interactive' });
    const source = context.createMediaStreamSource(stream);
    const gainNode = context.createGain();
    gainNode.gain.value = clampMonitorGain(gain);
    source.connect(gainNode);
    gainNode.connect(context.destination);

    this.context = context;
    this.source = source;
    this.gainNode = gainNode;
    if (context.state === 'suspended') await context.resume().catch(() => undefined);
  }

  setGain(gain: number) {
    if (!this.gainNode || !this.context) return;
    this.gainNode.gain.setTargetAtTime(clampMonitorGain(gain), this.context.currentTime, 0.01);
  }

  async close() {
    this.source?.disconnect();
    this.gainNode?.disconnect();
    this.source = null;
    this.gainNode = null;
    const context = this.context;
    this.context = null;
    if (context && context.state !== 'closed') await context.close().catch(() => undefined);
  }

  get active() {
    return Boolean(this.context && this.context.state !== 'closed');
  }
}

export function clampMonitorGain(value: number) {
  if (!Number.isFinite(value)) return 0.35;
  return Math.max(0, Math.min(1, value));
}
