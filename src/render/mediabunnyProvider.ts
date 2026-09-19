import {
  ALL_FORMATS,
  BlobSource,
  Input,
  VideoSampleSink,
  type VideoSample,
} from 'mediabunny';
import type { MediaFrameProvider, RenderFrameRequest } from './types';
import { recordDecodeLatency } from './decodeDiagnostics';

export interface MediabunnyVideoProviderOptions {
  maxCacheSize?: number;
  hardwareAcceleration?: 'no-preference' | 'prefer-hardware' | 'prefer-software';
}

/**
 * Random/sequential-access decoded frame provider backed by Mediabunny.
 *
 * A provider owns one Input and keeps its demux/decode state alive across frame
 * requests. This is important for exports and scrubbing: callers must not
 * recreate the provider for every frame.
 */
export class MediabunnyVideoProvider implements MediaFrameProvider<VideoSample> {
  private readonly blob: Blob;
  private readonly options: MediabunnyVideoProviderOptions;
  private input: Input<BlobSource> | null = null;
  private sink: VideoSampleSink | null = null;
  private opened = false;

  constructor(blob: Blob, options: MediabunnyVideoProviderOptions = {}) {
    this.blob = blob;
    this.options = options;
  }

  async open(signal?: AbortSignal) {
    if (this.opened) return;
    throwIfAborted(signal);

    const input = new Input({
      formats: ALL_FORMATS,
      source: new BlobSource(this.blob, {
        maxCacheSize: this.options.maxCacheSize ?? 16 * 1024 * 1024,
      }),
    });

    try {
      if (!(await input.canRead())) {
        throw new Error('Unsupported or unreadable media container');
      }
      throwIfAborted(signal);

      const track = await input.getPrimaryVideoTrack();
      if (!track) throw new Error('Media has no video track');
      if (!(await track.canDecode())) {
        const codec = await track.getCodecParameterString().catch(() => null);
        throw new Error(codec ? `Video codec cannot be decoded: ${codec}` : 'Video codec cannot be decoded');
      }
      throwIfAborted(signal);

      this.input = input;
      this.sink = new VideoSampleSink(track, {
        hardwareAcceleration: this.options.hardwareAcceleration ?? 'no-preference',
      });
      this.opened = true;
    } catch (error) {
      input.dispose();
      throw error;
    }
  }

  async getFrame(request: RenderFrameRequest, signal?: AbortSignal): Promise<VideoSample | null> {
    if (!this.opened || !this.sink) throw new Error('MediabunnyVideoProvider is not open');
    throwIfAborted(signal);

    const startedAt = metricNow();
    const sample = await this.sink.getSample(Math.max(0, request.timeSeconds));
    recordDecodeLatency(metricNow() - startedAt);
    if (signal?.aborted) {
      sample?.close();
      throwIfAborted(signal);
    }
    return sample;
  }

  async getFrameAt(timeSeconds: number, signal?: AbortSignal): Promise<VideoSample | null> {
    if (!Number.isFinite(timeSeconds) || timeSeconds < 0) {
      throw new RangeError(`timeSeconds must be a non-negative finite number, received ${timeSeconds}`);
    }
    if (!this.opened || !this.sink) throw new Error('MediabunnyVideoProvider is not open');
    throwIfAborted(signal);

    const startedAt = metricNow();
    const sample = await this.sink.getSample(timeSeconds);
    recordDecodeLatency(metricNow() - startedAt);
    if (signal?.aborted) {
      sample?.close();
      throwIfAborted(signal);
    }
    return sample;
  }

  close() {
    this.input?.dispose();
    this.input = null;
    this.sink = null;
    this.opened = false;
  }
}

function throwIfAborted(signal?: AbortSignal): asserts signal is AbortSignal | undefined {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  if (reason instanceof Error) throw reason;
  throw new DOMException(typeof reason === 'string' ? reason : 'Operation aborted', 'AbortError');
}

function metricNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
