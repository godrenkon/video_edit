import type { WrappedAudioBuffer } from 'mediabunny';
import { readAssetFile } from '../core/storage';
import type { AssetMeta, Clip, Project } from '../types/editor';
import { clipSourceTime } from './timelineEvaluation';
import { MediabunnyAudioProvider } from './mediabunnyAudioProvider';

export interface AudioMixSegment {
  clipId: string;
  assetId: string;
  timelineStart: number;
  timelineEnd: number;
  sourceStart: number;
  speed: number;
  reverse: boolean;
  gain: number;
}

export interface ProjectAudioMixerOptions {
  readFile?: (storageName: string) => Promise<File>;
  maxCacheSize?: number;
}

export interface AudioChunkOptions {
  sampleRate?: number;
  channels?: number;
  signal?: AbortSignal;
}

export function buildAudioMixSegments(project: Project, startSeconds: number, endSeconds: number): AudioMixSegment[] {
  const start = Math.max(0, startSeconds);
  const end = Math.max(start, endSeconds);
  const audioTracks = project.tracks.filter((track) => track.kind === 'audio');
  const hasSolo = audioTracks.some((track) => track.solo);
  const assetIds = new Set(project.assets.map((asset) => asset.id));
  const segments: AudioMixSegment[] = [];

  for (const track of audioTracks) {
    if (track.muted || (hasSolo && !track.solo)) continue;
    for (const clip of track.clips) {
      if (clip.muted || !clip.assetId || !assetIds.has(clip.assetId)) continue;
      const timelineStart = Math.max(start, clip.start);
      const timelineEnd = Math.min(end, clip.start + clip.duration);
      if (timelineEnd <= timelineStart) continue;

      segments.push({
        clipId: clip.id,
        assetId: clip.assetId,
        timelineStart,
        timelineEnd,
        sourceStart: clipSourceTime(clip, timelineStart),
        speed: Math.max(0.0001, clip.speed ?? 1),
        reverse: Boolean(clip.reverse),
        gain: Math.max(0, clip.volume),
      });
    }
  }

  return segments;
}

export function segmentSourceTime(segment: AudioMixSegment, timelineSeconds: number) {
  const delta = Math.max(0, timelineSeconds - segment.timelineStart) * segment.speed;
  return Math.max(0, segment.reverse ? segment.sourceStart - delta : segment.sourceStart + delta);
}

/**
 * Chunked project audio mixer. It decodes only source ranges that overlap the
 * requested timeline chunk, avoiding whole-file decodeAudioData allocations.
 */
export class ProjectAudioMixer {
  private readonly assets: Map<string, AssetMeta>;
  private readonly readFile: (storageName: string) => Promise<File>;
  private readonly maxCacheSize: number;
  private readonly providers = new Map<string, Promise<MediabunnyAudioProvider>>();
  private closed = false;

  constructor(assets: AssetMeta[], options: ProjectAudioMixerOptions = {}) {
    this.assets = new Map(assets.map((asset) => [asset.id, asset]));
    this.readFile = options.readFile ?? readAssetFile;
    this.maxCacheSize = options.maxCacheSize ?? 8 * 1024 * 1024;
  }

  async renderChunk(
    project: Project,
    startSeconds: number,
    durationSeconds: number,
    options: AudioChunkOptions = {},
  ): Promise<AudioBuffer> {
    this.assertOpen();
    const sampleRate = Math.max(8_000, Math.round(options.sampleRate ?? 48_000));
    const channels = Math.max(1, Math.min(2, Math.round(options.channels ?? 2)));
    const duration = Math.max(0, durationSeconds);
    const length = Math.max(1, Math.round(duration * sampleRate));
    const output = createAudioBuffer(length, channels, sampleRate);
    if (duration <= 0) return output;

    const segments = buildAudioMixSegments(project, startSeconds, startSeconds + duration);
    for (const segment of segments) {
      throwIfAborted(options.signal);
      const asset = this.assets.get(segment.assetId);
      if (!asset) continue;
      const provider = await this.getProvider(asset, options.signal);
      const sourceEnd = segmentSourceTime(segment, segment.timelineEnd);
      const sourceMin = Math.max(0, Math.min(segment.sourceStart, sourceEnd) - 0.02);
      const sourceMax = Math.max(segment.sourceStart, sourceEnd) + 0.02;
      const buffers = await provider.readRange(sourceMin, sourceMax, options.signal);
      mixSegment(output, buffers, segment, startSeconds, options.signal);
    }

    clampBuffer(output);
    return output;
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    const providers = await Promise.allSettled(this.providers.values());
    for (const result of providers) {
      if (result.status === 'fulfilled') result.value.close();
    }
    this.providers.clear();
  }

  private getProvider(asset: AssetMeta, signal?: AbortSignal) {
    let pending = this.providers.get(asset.id);
    if (!pending) {
      pending = (async () => {
        const file = await this.readFile(asset.storageName);
        throwIfAborted(signal);
        const provider = new MediabunnyAudioProvider(file, { maxCacheSize: this.maxCacheSize });
        try {
          await provider.open(signal);
          return provider;
        } catch (error) {
          provider.close();
          throw error;
        }
      })();
      this.providers.set(asset.id, pending);
      pending.catch(() => {
        if (this.providers.get(asset.id) === pending) this.providers.delete(asset.id);
      });
    }
    return pending;
  }

  private assertOpen() {
    if (this.closed) throw new Error('ProjectAudioMixer is closed');
  }
}

function mixSegment(
  output: AudioBuffer,
  buffers: WrappedAudioBuffer[],
  segment: AudioMixSegment,
  chunkStart: number,
  signal?: AbortSignal,
) {
  const firstFrame = Math.max(0, Math.floor((segment.timelineStart - chunkStart) * output.sampleRate));
  const lastFrame = Math.min(output.length, Math.ceil((segment.timelineEnd - chunkStart) * output.sampleRate));
  const outputChannels = Array.from({ length: output.numberOfChannels }, (_, channel) => output.getChannelData(channel));

  for (let frame = firstFrame; frame < lastFrame; frame += 1) {
    if ((frame & 4095) === 0) throwIfAborted(signal);
    const timelineTime = chunkStart + frame / output.sampleRate;
    const sourceTime = segmentSourceTime(segment, timelineTime);
    const wrapped = findWrappedBuffer(buffers, sourceTime);
    if (!wrapped) continue;

    const source = wrapped.buffer;
    const sourceFrame = Math.max(0, (sourceTime - wrapped.timestamp) * source.sampleRate);
    const leftIndex = Math.min(source.length - 1, Math.floor(sourceFrame));
    const rightIndex = Math.min(source.length - 1, leftIndex + 1);
    const fraction = sourceFrame - leftIndex;

    for (let channel = 0; channel < outputChannels.length; channel += 1) {
      const sourceChannel = Math.min(channel, source.numberOfChannels - 1);
      const data = source.getChannelData(sourceChannel);
      const sample = data[leftIndex] * (1 - fraction) + data[rightIndex] * fraction;
      outputChannels[channel][frame] += sample * segment.gain;
    }
  }
}

function findWrappedBuffer(buffers: WrappedAudioBuffer[], sourceTime: number) {
  let low = 0;
  let high = buffers.length - 1;
  let candidate: WrappedAudioBuffer | null = null;
  while (low <= high) {
    const mid = (low + high) >> 1;
    const current = buffers[mid];
    if (current.timestamp <= sourceTime) {
      candidate = current;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  if (!candidate) return null;
  const end = candidate.timestamp + Math.max(candidate.duration, candidate.buffer.duration);
  return sourceTime < end + 1e-6 ? candidate : null;
}

function clampBuffer(buffer: AudioBuffer) {
  for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
    const data = buffer.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.max(-1, Math.min(1, data[i]));
  }
}

function createAudioBuffer(length: number, numberOfChannels: number, sampleRate: number) {
  if (typeof AudioBuffer === 'undefined') throw new Error('AudioBuffer is not available in this browser context');
  return new AudioBuffer({ length, numberOfChannels, sampleRate });
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  if (reason instanceof Error) throw reason;
  throw new DOMException(typeof reason === 'string' ? reason : 'Operation aborted', 'AbortError');
}
