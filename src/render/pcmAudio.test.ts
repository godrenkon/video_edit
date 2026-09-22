import { describe, expect, it, vi } from 'vitest';
import { copyAudioSampleToPcm, createPcmAudioBuffer } from './pcmAudio';

describe('worker-safe PCM audio', () => {
  it('stores channels in one planar allocation', () => {
    const buffer = createPcmAudioBuffer(3, 2, 48_000);
    buffer.getChannelData(0).set([0.1, 0.2, 0.3]);
    buffer.getChannelData(1).set([-0.1, -0.2, -0.3]);

    expect(Array.from(buffer.data)).toEqual([
      expect.closeTo(0.1), expect.closeTo(0.2), expect.closeTo(0.3),
      expect.closeTo(-0.1), expect.closeTo(-0.2), expect.closeTo(-0.3),
    ]);
    expect(buffer.duration).toBe(3 / 48_000);
    expect(() => buffer.getChannelData(2)).toThrow(RangeError);
  });

  it('copies decoded AudioSample planes without requiring AudioBuffer', () => {
    const planes = [new Float32Array([0.25, 0.5]), new Float32Array([-0.25, -0.5])];
    const copyTo = vi.fn((destination: AllowSharedBufferSource, options: { planeIndex: number }) => {
      new Float32Array(
        ArrayBuffer.isView(destination) ? destination.buffer : destination,
        ArrayBuffer.isView(destination) ? destination.byteOffset : 0,
        2,
      ).set(planes[options.planeIndex]);
    });
    const sample = {
      numberOfFrames: 2,
      numberOfChannels: 2,
      sampleRate: 48_000,
      copyTo,
    } as unknown as Parameters<typeof copyAudioSampleToPcm>[0];

    const buffer = copyAudioSampleToPcm(sample);
    expect(Array.from(buffer.getChannelData(0))).toEqual([0.25, 0.5]);
    expect(Array.from(buffer.getChannelData(1))).toEqual([-0.25, -0.5]);
    expect(copyTo).toHaveBeenNthCalledWith(1, buffer.getChannelData(0), { format: 'f32-planar', planeIndex: 0 });
    expect(copyTo).toHaveBeenNthCalledWith(2, buffer.getChannelData(1), { format: 'f32-planar', planeIndex: 1 });
  });
});
