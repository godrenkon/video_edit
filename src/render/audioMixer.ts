import type { WrappedAudioBuffer } from 'mediabunny';
import { readAssetFile } from '../core/storage';
import type { AssetMeta, Clip, EffectInstance, Project } from '../types/editor';
import { clipFadeGain } from './audioEnvelope';
import { clipSourceTime } from './timelineEvaluation';
import {
  createAudioEffectState,
  processAudioEffects,
  resetAudioEffectState,
  resolveAudioEffects,
  type AudioEffectState,
} from './audioEffects';
import { MediabunnyAudioProvider } from './mediabunnyAudioProvider';

export interface AudioMixSegment {
  clipId: string;
  assetId: string;
  clipStart: number;
  clipDuration: number;
  timelineStart: number;
  timelineEnd: number;
  sourceStart: number;
  speed: number;
  reverse: boolean;
  gain: number;
  fadeIn: number;
  fadeOut: number;
  effects: EffectInstance[];
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
  const assetById = new Map(project.assets.map((asset) => [asset.id, asset]));
  const candidateTracks = project.tracks.filter((track) => track.kind === 'audio' || track.kind === 'video');
  const hasSolo = candidateTracks.some((track) => track.solo);
  const segments: AudioMixSegment[] = [];

  for (const track of candidateTracks) {
    if (track.muted || (hasSolo && !track.solo)) continue;
    for (const clip of track.clips) {
      if (clip.muted || !clip.assetId) continue;
      const asset = assetById.get(clip.assetId);
      if (!asset || (asset.kind !== 'audio' && asset.kind !== 'video')) continue;
      if (asset.kind === 'video' && typeof clip.freezeFrameAt === 'number' && Number.isFinite(clip.freezeFrameAt)) continue;
      const timelineStart = Math.max(start, clip.start);
      const timelineEnd = Math.min(end, clip.start + clip.duration);
      if (timelineEnd <= timelineStart) continue;

      segments.push({
        clipId: clip.id,
        assetId: clip.assetId,
        clipStart: clip.start,
        clipDuration: Math.max(0, clip.duration),
        timelineStart,
        timelineEnd,
        sourceStart: clipSourceTime(clip, timelineStart),
        speed: Math.max(0.0001, clip.speed ?? 1),
        reverse: Boolean(clip.reverse),
        gain: Math.max(0, clip.volume),
        fadeIn: Math.max(0, clip.fadeIn ?? 0),
        fadeOut: Math.max(0, clip.fadeOut ?? 0),
        effects: clip.effects ?? [],
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
 * Video assets are also inspected for embedded audio so ordinary video clips
 * keep their sound in preview/export workflows.
 */
export class ProjectAudioMixer {
  private readonly assets: Map<string, AssetMeta>;
  private readonly readFile: (storageName: string) => Promise<File>;
  private readonly maxCacheSize: number;
  private readonly providers = new Map<string, Promise<MediabunnyAudioProvider | null>>();
  private readonly effectStates = new Map<string, AudioEffectState>();
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
      if (!provider) continue;
      const sourceEnd = segmentSourceTime(segment, segment.timelineEnd);
      const sourceMin = Math.max(0, Math.min(segment.sourceStart, sourceEnd) - 0.02);
      const sourceMax = Math.max(segment.sourceStart, sourceEnd) + 0.02;
      const buffers = await provider.readRange(sourceMin, sourceMax, options.signal);
      mixSegment(output, buffers, segment, startSeconds, this.effectStateFor(segment.clipId), options.signal);
    }

    clampBuffer(output);
    return output;
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    const providers = await Promise.allSettled(this.providers.values());
    for (const result of providers) {
      if (result.status === 'fulfilled') result.value?.close();
    }
    this.providers.clear();
    this.effectStates.clear();
  }

  private effectStateFor(clipId: string) {
    let state = this.effectStates.get(clipId);
    if (!state) {
      state = createAudioEffectState();
      this.effectStates.set(clipId, state);
    }
    return state;
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
          if (error instanceof Error && error.message === 'Media has no audio track') return null;
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
  effectState: AudioEffectState,
  signal?: AbortSignal,
) {
  const firstFrame = Math.max(0, Math.floor((segment.timelineStart - chunkStart) * output.sampleRate));
  const lastFrame = Math.min(output.length, Math.ceil((segment.timelineEnd - chunkStart) * output.sampleRate));
  const outputChannels = Array.from({ length: output.numberOfChannels }, (_, channel) => output.getChannelData(channel));
  const firstTimelineTime = chunkStart + firstFrame / output.sampleRate;
  const expectedPrevious = firstTimelineTime - 1 / output.sampleRate;
  if (effectState.lastTimelineTime !== null && Math.abs(effectState.lastTimelineTime - expectedPrevious) > 2 / output.sampleRate) {
    resetAudioEffectState(effectState);
  }

  let resolvedEffects = resolveAudioEffects(segment.effects, Math.max(0, firstTimelineTime - segment.clipStart));
  for (let frame = firstFrame; frame < lastFrame; frame += 1) {
    if ((frame & 4095) === 0) throwIfAborted(signal);
    const timelineTime = chunkStart + frame / output.sampleRate;
    const clipLocalTime = Math.max(0, timelineTime - segment.clipStart);
    const sourceTime = segmentSourceTime(segment, timelineTime);
    const wrapped = findWrappedBuffer(buffers, sourceTime);
    if (!wrapped) continue;

    if ((frame - firstFrame) % 128 === 0) {
      resolvedEffects = resolveAudioEffects(segment.effects, clipLocalTime);
    }

    const source = wrapped.buffer;
    const sourceFrame = Math.max(0, (sourceTime - wrapped.timestamp) * source.sampleRate);
    const envelopeGain = clipFadeGain({
      duration: segment.clipDuration,
      fadeIn: segment.fadeIn,
      fadeOut: segment.fadeOut,
    }, clipLocalTime);
    const clipGain = segment.gain * envelopeGain;
    let left = sampleChannel(source, 0, sourceFrame) * clipGain;
    let right = sampleChannel(source, Math.min(1, source.numberOfChannels - 1), sourceFrame) * clipGain;
    [left, right] = processAudioEffects(left, right, resolvedEffects, output.sampleRate, effectState);

    if (outputChannels.length === 1) {
      outputChannels[0][frame] += (left + right) * 0.5;
    } else {
      outputChannels[0][frame] += left;
      outputChannels[1][frame] += right;
    }
    effectState.lastTimelineTime = timelineTime;
  }
}

function sampleChannel(source: AudioBuffer, channel: number, sourceFrame: number) {
  const safeChannel = Math.max(0, Math.min(source.numberOfChannels - 1, channel));
  const data = source.getChannelData(safeChannel);
  const leftIndex = Math.min(source.length - 1, Math.max(0, Math.floor(sourceFrame)));
  const rightIndex = Math.min(source.length - 1, leftIndex + 1);
  const fraction = Math.max(0, Math.min(1, sourceFrame - leftIndex));
  return data[leftIndex] * (1 - fraction) + data[rightIndex] * fraction;
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
