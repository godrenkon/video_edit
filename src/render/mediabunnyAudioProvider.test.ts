import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  leading: null as FakeAudioSample | null,
  streamed: [] as FakeAudioSample[],
  disposed: vi.fn(),
}));

interface FakeAudioSample {
  timestamp: number;
  duration: number;
  numberOfFrames: number;
  numberOfChannels: number;
  sampleRate: number;
  copyTo: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

vi.mock('mediabunny', () => ({
  ALL_FORMATS: [],
  BlobSource: class {},
  Input: class {
    async canRead() { return true; }
    async getPrimaryAudioTrack() {
      return {
        canDecode: async () => true,
        getCodecParameterString: async () => 'pcm',
      };
    }
    dispose() { mocks.disposed(); }
  },
  AudioSampleSink: class {
    async getSample() { return mocks.leading; }
    async *samples() {
      for (const sample of mocks.streamed) yield sample;
    }
  },
}));

function fakeSample(timestamp: number, channels: number[][]): FakeAudioSample {
  const planes = channels.map((channel) => new Float32Array(channel));
  return {
    timestamp,
    duration: planes[0].length / 48_000,
    numberOfFrames: planes[0].length,
    numberOfChannels: planes.length,
    sampleRate: 48_000,
    copyTo: vi.fn((destination: AllowSharedBufferSource, options: { planeIndex: number }) => {
      const view = ArrayBuffer.isView(destination)
        ? new Float32Array(destination.buffer, destination.byteOffset, destination.byteLength / Float32Array.BYTES_PER_ELEMENT)
        : new Float32Array(destination);
      view.set(planes[options.planeIndex]);
    }),
    close: vi.fn(),
  };
}

describe('MediabunnyAudioProvider', () => {
  beforeEach(() => {
    mocks.leading = null;
    mocks.streamed = [];
    mocks.disposed.mockClear();
  });

  it('decodes worker-safe PCM planes and closes every AudioSample', async () => {
    const leading = fakeSample(0, [[0.1, 0.2], [-0.1, -0.2]]);
    const duplicate = fakeSample(0, [[9, 9], [9, 9]]);
    const next = fakeSample(2 / 48_000, [[0.3, 0.4], [-0.3, -0.4]]);
    mocks.leading = leading;
    mocks.streamed = [duplicate, next];
    const { MediabunnyAudioProvider } = await import('./mediabunnyAudioProvider');
    const provider = new MediabunnyAudioProvider(new Blob(['audio']));

    await provider.open();
    const buffers = await provider.readRange(0, 1);

    expect(buffers).toHaveLength(2);
    expect(Array.from(buffers[0].buffer.getChannelData(0))).toEqual([
      expect.closeTo(0.1),
      expect.closeTo(0.2),
    ]);
    expect(Array.from(buffers[1].buffer.getChannelData(1))).toEqual([
      expect.closeTo(-0.3),
      expect.closeTo(-0.4),
    ]);
    expect(leading.close).toHaveBeenCalledOnce();
    expect(duplicate.close).toHaveBeenCalledOnce();
    expect(next.close).toHaveBeenCalledOnce();
    expect(duplicate.copyTo).not.toHaveBeenCalled();

    provider.close();
    expect(mocks.disposed).toHaveBeenCalledOnce();
  });
});
