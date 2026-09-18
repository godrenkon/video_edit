class SuiramDynamicsProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.kind = options?.processorOptions?.kind === 'de-esser' ? 'de-esser' : 'gate-expander';
    this.params = this.kind === 'de-esser'
      ? { frequency: 6000, thresholdDb: -28, ratio: 6, maxReductionDb: 12, attack: 0.002, release: 0.08 }
      : { thresholdDb: -45, ratio: 4, rangeDb: 60, attack: 0.005, release: 0.08 };
    this.gain = 1;
    this.gainInitialized = false;
    this.deEsserIn = [];
    this.deEsserOut = [];
    this.deEsserInitialized = [];
    this.port.onmessage = (event) => {
      if (!event?.data || event.data.type !== 'params') return;
      this.params = { ...this.params, ...event.data.params };
    };
  }

  process(inputs, outputs) {
    const input = inputs[0];
    const output = outputs[0];
    if (!input || input.length === 0 || !output || output.length === 0) return true;
    const frames = output[0]?.length ?? 0;
    if (frames === 0) return true;

    if (this.kind === 'de-esser') this.processDeEsser(input, output, frames);
    else this.processGate(input, output, frames);
    return true;
  }

  processGate(input, output, frames) {
    const thresholdDb = clampNumber(this.params.thresholdDb, -100, 0, -45);
    const ratio = clampNumber(this.params.ratio, 1, 20, 4);
    const rangeDb = clampNumber(this.params.rangeDb, 0, 100, 60);
    const attack = clampNumber(this.params.attack, 0, 1, 0.005);
    const release = clampNumber(this.params.release, 0, 2, 0.08);

    for (let frame = 0; frame < frames; frame += 1) {
      let peak = 1e-12;
      for (let channel = 0; channel < input.length; channel += 1) {
        peak = Math.max(peak, Math.abs(input[channel]?.[frame] ?? 0));
      }
      const inputDb = 20 * Math.log10(peak);
      const belowDb = Math.max(0, thresholdDb - inputDb);
      const reductionDb = Math.min(rangeDb, belowDb * Math.max(0, ratio - 1));
      const targetGain = 10 ** (-reductionDb / 20);
      if (!this.gainInitialized) {
        this.gain = targetGain;
        this.gainInitialized = true;
      } else {
        this.gain = smoothGain(this.gain, targetGain, targetGain > this.gain ? attack : release);
      }

      for (let channel = 0; channel < output.length; channel += 1) {
        output[channel][frame] = (input[channel]?.[frame] ?? input[0]?.[frame] ?? 0) * this.gain;
      }
    }
  }

  processDeEsser(input, output, frames) {
    const frequency = clampNumber(this.params.frequency, 2000, Math.max(2000, sampleRate * 0.45), 6000);
    const thresholdDb = clampNumber(this.params.thresholdDb, -60, 0, -28);
    const ratio = clampNumber(this.params.ratio, 1, 20, 6);
    const maxReductionDb = clampNumber(this.params.maxReductionDb, 0, 30, 12);
    const attack = clampNumber(this.params.attack, 0, 0.2, 0.002);
    const release = clampNumber(this.params.release, 0, 1, 0.08);
    const dt = 1 / sampleRate;
    const rc = 1 / (Math.PI * 2 * frequency);
    const alpha = rc / (rc + dt);

    while (this.deEsserIn.length < output.length) {
      this.deEsserIn.push(0);
      this.deEsserOut.push(0);
      this.deEsserInitialized.push(false);
    }

    for (let frame = 0; frame < frames; frame += 1) {
      const highs = new Array(output.length).fill(0);
      let detectorPeak = 1e-12;

      for (let channel = 0; channel < output.length; channel += 1) {
        const sample = input[channel]?.[frame] ?? input[0]?.[frame] ?? 0;
        let high = 0;
        if (!this.deEsserInitialized[channel]) {
          this.deEsserIn[channel] = sample;
          this.deEsserOut[channel] = 0;
          this.deEsserInitialized[channel] = true;
        } else {
          high = alpha * (this.deEsserOut[channel] + sample - this.deEsserIn[channel]);
          this.deEsserIn[channel] = sample;
          this.deEsserOut[channel] = high;
        }
        highs[channel] = high;
        detectorPeak = Math.max(detectorPeak, Math.abs(high));
      }

      const detectorDb = 20 * Math.log10(detectorPeak);
      const overDb = Math.max(0, detectorDb - thresholdDb);
      const reductionDb = Math.min(maxReductionDb, overDb - overDb / Math.max(1, ratio));
      const targetGain = 10 ** (-reductionDb / 20);
      this.gain = smoothGain(this.gain, targetGain, targetGain < this.gain ? attack : release);

      for (let channel = 0; channel < output.length; channel += 1) {
        const sample = input[channel]?.[frame] ?? input[0]?.[frame] ?? 0;
        const high = highs[channel];
        output[channel][frame] = (sample - high) + high * this.gain;
      }
    }
  }
}

function smoothGain(current, target, seconds) {
  const safeTime = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  if (safeTime <= 0) return target;
  const coefficient = Math.exp(-1 / (Math.max(1e-5, safeTime) * sampleRate));
  return target + coefficient * (current - target);
}

function clampNumber(value, min, max, fallback) {
  const numeric = Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, numeric));
}

registerProcessor('suiram-dynamics', SuiramDynamicsProcessor);
