import {
  AudioSample,
  AudioSampleSource,
  BufferTarget,
  CanvasSource,
  Mp4OutputFormat,
  Output,
  Quality,
  type StreamTarget,
  type Target,
} from 'mediabunny';
import { runFrameRenderLoop } from './frameLoop';
import { createOpfsRenderTarget } from './opfsRenderTarget';
import { planAudioChunks, type AudioChunkPlan } from './renderSchedule';
import type { RenderFrameRequest, RenderProgress } from './types';
import type { PcmAudioBuffer } from './pcmAudio';

export interface Mp4AudioRenderOptions {
  codec?: 'aac';
  bitrate?: number;
  chunkSeconds?: number;
  sampleRate?: number;
  renderChunk: (startSeconds: number, durationSeconds: number, signal?: AbortSignal) => Promise<PcmAudioBuffer>;
}

export interface Mp4RenderOptions {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  bitrate?: number;
  keyFrameIntervalSeconds?: number;
  audio?: Mp4AudioRenderOptions;
  signal?: AbortSignal;
  onProgress?: (progress: RenderProgress) => void;
  drawFrame: (request: RenderFrameRequest, signal?: AbortSignal) => Promise<void> | void;
}

export interface OpfsMp4RenderResult {
  fileName: string;
  file: File;
  mimeType: string;
}

class MediabunnyMp4CanvasWriter {
  private readonly output: Output;
  private readonly source: CanvasSource;
  private readonly audioSource: AudioSampleSource | null;
  private readonly keyFrameInterval: number;
  private started = false;
  private lastTimestampUs = -1;

  constructor(target: Target, options: Pick<Mp4RenderOptions, 'canvas' | 'fps' | 'bitrate' | 'keyFrameIntervalSeconds' | 'audio'>) {
    this.output = new Output({ format: new Mp4OutputFormat(), target });
    this.source = new CanvasSource(options.canvas, {
      codec: 'avc',
      quality: new Quality({ bitrate: options.bitrate ?? 8_000_000 }),
      latencyMode: 'quality',
    });
    this.output.addVideoTrack(this.source, { frameRate: options.fps });

    if (options.audio) {
      this.audioSource = new AudioSampleSource({
        codec: options.audio.codec ?? 'aac',
        quality: new Quality({ bitrate: options.audio.bitrate ?? 192_000 }),
      });
      this.output.addAudioTrack(this.audioSource);
    } else {
      this.audioSource = null;
    }

    this.keyFrameInterval = Math.max(1, Math.round(options.fps * (options.keyFrameIntervalSeconds ?? 2)));
  }

  async start() {
    if (this.started) throw new Error('MP4 writer is already started');
    await this.output.start();
    this.started = true;
  }

  async addFrame(request: RenderFrameRequest) {
    if (!this.started || this.output.state !== 'started') throw new Error('MP4 writer is not ready for frames');
    if (request.timestampUs <= this.lastTimestampUs) {
      throw new Error(`Non-monotonic render timestamp: ${request.timestampUs} <= ${this.lastTimestampUs}`);
    }

    const keyFrame = request.frameIndex % this.keyFrameInterval === 0;
    await this.source.add(request.timestampUs / 1_000_000, request.durationUs / 1_000_000, { keyFrame });
    this.lastTimestampUs = request.timestampUs;
  }

  async addAudioBuffer(buffer: PcmAudioBuffer, timestamp: number) {
    if (!this.audioSource) throw new Error('MP4 writer has no audio track');
    if (!this.started || this.output.state !== 'started') throw new Error('MP4 writer is not ready for audio');
    const sample = new AudioSample({
      data: buffer.data,
      format: 'f32-planar',
      numberOfChannels: buffer.numberOfChannels,
      sampleRate: buffer.sampleRate,
      timestamp,
    });
    try {
      await this.audioSource.add(sample);
    } finally {
      sample.close();
    }
  }

  async finalize() {
    if (!this.started) throw new Error('MP4 writer was not started');
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

export async function renderCanvasToMp4Buffer(options: Mp4RenderOptions): Promise<Blob> {
  const target = new BufferTarget();
  const writer = new MediabunnyMp4CanvasWriter(target, options);

  try {
    await writer.start();
    await runRenderLoop(writer, options);
    const mimeType = await writer.finalize();
    if (!target.buffer) throw new Error('MP4 output finalized without a buffer');
    return new Blob([target.buffer], { type: mimeType || 'video/mp4' });
  } catch (error) {
    await writer.cancel().catch(() => undefined);
    throw error;
  }
}

export async function renderCanvasToOpfsMp4(fileName: string, options: Mp4RenderOptions): Promise<OpfsMp4RenderResult> {
  const destination = await createOpfsRenderTarget(fileName);
  const writer = new MediabunnyMp4CanvasWriter(destination.target as StreamTarget, options);

  try {
    await writer.start();
    await runRenderLoop(writer, options);
    const mimeType = await writer.finalize();
    return {
      fileName: destination.fileName,
      file: await destination.getFile(),
      mimeType: mimeType || 'video/mp4',
    };
  } catch (error) {
    await writer.cancel().catch(() => undefined);
    await destination.remove().catch(() => undefined);
    throw error;
  }
}

async function runRenderLoop(writer: MediabunnyMp4CanvasWriter, options: Mp4RenderOptions) {
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
    await writer.addAudioBuffer(buffer, chunk.startSeconds);
    nextAudioChunkIndex = chunk.index + 1;
  };

  const addNextAudioChunk = async () => {
    const chunk = audioChunks[nextAudioChunkIndex];
    if (!chunk) return;
    await addAudioChunk(chunk);
  };

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
