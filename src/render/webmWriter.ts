import {
  AudioBufferSource as MediabunnyAudioBufferSource,
  BufferTarget,
  CanvasSource,
  Output,
  Quality,
  WebMOutputFormat,
  type StreamTarget,
  type Target,
} from 'mediabunny';
import { runFrameRenderLoop } from './frameLoop';
import { createOpfsRenderTarget } from './opfsRenderTarget';
import { planAudioChunks, type AudioChunkPlan } from './renderSchedule';
import type { RenderFrameRequest, RenderProgress } from './types';

export type WebMVideoCodec = 'vp8' | 'vp9' | 'av1';

export interface WebMAudioRenderOptions {
  codec?: 'opus';
  bitrate?: number;
  chunkSeconds?: number;
  sampleRate?: number;
  renderChunk: (startSeconds: number, durationSeconds: number, signal?: AbortSignal) => Promise<AudioBuffer>;
}

export interface WebMRenderOptions {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  codec?: WebMVideoCodec;
  bitrate?: number;
  keyFrameIntervalSeconds?: number;
  audio?: WebMAudioRenderOptions;
  signal?: AbortSignal;
  onProgress?: (progress: RenderProgress) => void;
  drawFrame: (request: RenderFrameRequest, signal?: AbortSignal) => Promise<void> | void;
}

export interface OpfsWebMRenderResult {
  fileName: string;
  file: File;
  mimeType: string;
}

class MediabunnyWebMCanvasWriter {
  private readonly output: Output;
  private readonly source: CanvasSource;
  private readonly audioSource: MediabunnyAudioBufferSource | null;
  private readonly keyFrameInterval: number;
  private started = false;
  private lastTimestampUs = -1;

  constructor(target: Target, options: Pick<WebMRenderOptions, 'canvas' | 'fps' | 'codec' | 'bitrate' | 'keyFrameIntervalSeconds' | 'audio'>) {
    const format = new WebMOutputFormat();
    this.output = new Output({ format, target });
    this.source = new CanvasSource(options.canvas, {
      codec: options.codec ?? 'vp9',
      quality: new Quality({ bitrate: options.bitrate ?? 8_000_000 }),
      latencyMode: 'quality',
    });
    this.output.addVideoTrack(this.source, { frameRate: options.fps });

    if (options.audio) {
      this.audioSource = new MediabunnyAudioBufferSource({
        codec: options.audio.codec ?? 'opus',
        quality: new Quality({ bitrate: options.audio.bitrate ?? 160_000 }),
      });
      this.output.addAudioTrack(this.audioSource);
    } else {
      this.audioSource = null;
    }

    this.keyFrameInterval = Math.max(1, Math.round(options.fps * (options.keyFrameIntervalSeconds ?? 2)));
  }

  async start() {
    if (this.started) throw new Error('WebM writer is already started');
    await this.output.start();
    this.started = true;
  }

  async addFrame(request: RenderFrameRequest) {
    if (!this.started || this.output.state !== 'started') throw new Error('WebM writer is not ready for frames');
    if (request.timestampUs <= this.lastTimestampUs) {
      throw new Error(`Non-monotonic render timestamp: ${request.timestampUs} <= ${this.lastTimestampUs}`);
    }

    const keyFrame = request.frameIndex % this.keyFrameInterval === 0;
    await this.source.add(request.timestampUs / 1_000_000, request.durationUs / 1_000_000, { keyFrame });
    this.lastTimestampUs = request.timestampUs;
  }

  async addAudioBuffer(buffer: AudioBuffer) {
    if (!this.audioSource) throw new Error('WebM writer has no audio track');
    if (!this.started || this.output.state !== 'started') throw new Error('WebM writer is not ready for audio');
    await this.audioSource.add(buffer);
  }

  async finalize() {
    if (!this.started) throw new Error('WebM writer was not started');
    this.source.close();
    this.audioSource?.close();
    await this.output.finalize();
    return this.output.getMimeType();
  }

  async cancel() {
    if (this.output.state === 'canceled' || this.output.state === 'finalized') return;
    await this.output.cancel();
  }
}

/**
 * In-memory WebM output for smaller renders and tests. Large projects should
 * use renderCanvasToOpfsWebM so encoded bytes never accumulate into one giant
 * JS ArrayBuffer.
 */
export async function renderCanvasToWebMBuffer(options: WebMRenderOptions): Promise<Blob> {
  const target = new BufferTarget();
  const writer = new MediabunnyWebMCanvasWriter(target, options);

  try {
    await writer.start();
    await runRenderLoop(writer, options);
    const mimeType = await writer.finalize();
    if (!target.buffer) throw new Error('WebM output finalized without a buffer');
    return new Blob([target.buffer], { type: mimeType || 'video/webm' });
  } catch (error) {
    await writer.cancel().catch(() => undefined);
    throw error;
  }
}

/**
 * Long-form WebM output. Encoded chunks are written directly to OPFS at the
 * exact byte positions requested by the muxer, so finalization may patch
 * headers without keeping the whole movie in memory.
 */
export async function renderCanvasToOpfsWebM(fileName: string, options: WebMRenderOptions): Promise<OpfsWebMRenderResult> {
  const destination = await createOpfsRenderTarget(fileName);
  const writer = new MediabunnyWebMCanvasWriter(destination.target as StreamTarget, options);

  try {
    await writer.start();
    await runRenderLoop(writer, options);
    const mimeType = await writer.finalize();
    return {
      fileName: destination.fileName,
      file: await destination.getFile(),
      mimeType: mimeType || 'video/webm',
    };
  } catch (error) {
    await writer.cancel().catch(() => undefined);
    await destination.remove().catch(() => undefined);
    throw error;
  }
}

async function runRenderLoop(writer: MediabunnyWebMCanvasWriter, options: WebMRenderOptions) {
  const audioChunks = options.audio
    ? planAudioChunks(
        options.durationSeconds,
        options.audio.chunkSeconds ?? 2,
        options.audio.sampleRate ?? 48_000,
      )
    : [];
  let nextAudioChunkIndex = 0;

  const addAudioChunk = async (chunk: AudioChunkPlan) => {
    if (!options.audio) return;
    const buffer = await options.audio.renderChunk(chunk.startSeconds, chunk.durationSeconds, options.signal);
    await writer.addAudioBuffer(buffer);
    nextAudioChunkIndex = chunk.index + 1;
  };

  const addNextAudioChunk = async () => {
    const chunk = audioChunks[nextAudioChunkIndex];
    if (!chunk) return;
    await addAudioChunk(chunk);
  };

  // Keep audio slightly ahead of video so neither track needs to buffer the
  // entire render while waiting for the other one to begin.
  if (audioChunks.length > 0) await addNextAudioChunk();

  await runFrameRenderLoop({
    width: options.width,
    height: options.height,
    fps: options.fps,
    durationSeconds: options.durationSeconds,
    signal: options.signal,
    onProgress: options.onProgress,
    renderFrame: async (request, signal) => {
      await options.drawFrame(request, signal);
      await writer.addFrame(request);

      const videoEnd = request.timeSeconds + request.durationUs / 1_000_000;
      while (nextAudioChunkIndex < audioChunks.length && videoEnd + 1e-9 >= audioChunks[nextAudioChunkIndex].startSeconds) {
        await addNextAudioChunk();
      }
    },
  });

  while (nextAudioChunkIndex < audioChunks.length) {
    await addNextAudioChunk();
  }
}
