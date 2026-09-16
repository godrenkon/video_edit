import {
  ALL_FORMATS,
  AudioBufferSink,
  BlobSource,
  Input,
  type WrappedAudioBuffer,
} from 'mediabunny';

export interface MediabunnyAudioProviderOptions {
  maxCacheSize?: number;
}

/**
 * Lazily decodes only the requested portions of an audio track. The provider
 * keeps one Input/Sink alive so sequential export chunks can reuse demux state.
 */
export class MediabunnyAudioProvider {
  private readonly blob: Blob;
  private readonly options: MediabunnyAudioProviderOptions;
  private input: Input<BlobSource> | null = null;
  private sink: AudioBufferSink | null = null;
  private opened = false;

  constructor(blob: Blob, options: MediabunnyAudioProviderOptions = {}) {
    this.blob = blob;
    this.options = options;
  }

  async open(signal?: AbortSignal) {
    if (this.opened) return;
    throwIfAborted(signal);

    const input = new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(this.blob, {
        maxCacheSize: this.options.maxCacheSize ?? 8 * 1024 * 1024,
      }),
    });

    try {
      if (!(await input.canRead())) throw new Error('Unsupported or unreadable audio container');
      const track = await input.getPrimaryAudioTrack();
      if (!track) throw new Error('Media has no audio track');
      if (!(await track.canDecode())) {
        const codec = await track.getCodecParameterString().catch(() => null);
        throw new Error(codec ? `Audio codec cannot be decoded: ${codec}` : 'Audio codec cannot be decoded');
      }
      throwIfAborted(signal);

      this.input = input;
      this.sink = new AudioBufferSink(track);
      this.opened = true;
    } catch (error) {
      input.dispose();
      throw error;
    }
  }

  async readRange(startSeconds: number, endSeconds: number, signal?: AbortSignal): Promise<WrappedAudioBuffer[]> {
    if (!this.opened || !this.sink) throw new Error('MediabunnyAudioProvider is not open');
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds < startSeconds) {
      throw new RangeError('Invalid audio range');
    }
    throwIfAborted(signal);

    const start = Math.max(0, startSeconds);
    const end = Math.max(start, endSeconds);
    const result: WrappedAudioBuffer[] = [];
    const timestamps = new Set<number>();

    const leading = await this.sink.getBuffer(start);
    if (leading && leading.timestamp + leading.duration > start) {
      result.push(leading);
      timestamps.add(leading.timestamp);
    }

    for await (const wrapped of this.sink.buffers(start, end)) {
      throwIfAborted(signal);
      if (timestamps.has(wrapped.timestamp)) continue;
      result.push(wrapped);
      timestamps.add(wrapped.timestamp);
    }

    result.sort((a, b) => a.timestamp - b.timestamp);
    return result;
  }

  close() {
    this.input?.dispose();
    this.input = null;
    this.sink = null;
    this.opened = false;
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  if (reason instanceof Error) throw reason;
  throw new DOMException(typeof reason === 'string' ? reason : 'Operation aborted', 'AbortError');
}
