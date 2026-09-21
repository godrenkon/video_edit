import type { AudioSample } from 'mediabunny';

export interface PcmAudioBuffer {
  readonly data: Float32Array;
  readonly length: number;
  readonly numberOfChannels: number;
  readonly sampleRate: number;
  readonly duration: number;
  getChannelData(channel: number): Float32Array;
}

export function createPcmAudioBuffer(
  length: number,
  numberOfChannels: number,
  sampleRate: number,
  data?: Float32Array,
): PcmAudioBuffer {
  const safeLength = Math.max(0, Math.floor(length));
  const safeChannels = Math.max(1, Math.floor(numberOfChannels));
  const safeSampleRate = Math.max(1, Math.floor(sampleRate));
  const samples = data ?? new Float32Array(safeLength * safeChannels);
  if (samples.length !== safeLength * safeChannels) {
    throw new RangeError('PCM data length does not match its frame and channel count');
  }

  return {
    data: samples,
    length: safeLength,
    numberOfChannels: safeChannels,
    sampleRate: safeSampleRate,
    duration: safeLength / safeSampleRate,
    getChannelData(channel: number) {
      if (!Number.isInteger(channel) || channel < 0 || channel >= safeChannels) {
        throw new RangeError(`PCM channel ${channel} is out of range`);
      }
      const start = channel * safeLength;
      return samples.subarray(start, start + safeLength);
    },
  };
}

export function copyAudioSampleToPcm(sample: AudioSample): PcmAudioBuffer {
  const buffer = createPcmAudioBuffer(sample.numberOfFrames, sample.numberOfChannels, sample.sampleRate);
  for (let channel = 0; channel < sample.numberOfChannels; channel += 1) {
    sample.copyTo(buffer.getChannelData(channel), { format: 'f32-planar', planeIndex: channel });
  }
  return buffer;
}
