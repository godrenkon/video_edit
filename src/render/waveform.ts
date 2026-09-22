import { readAssetFile, readWaveformCache, saveWaveformCache } from '../core/storage';
import type { AssetMeta } from '../types/editor';
import { MediabunnyAudioProvider } from './mediabunnyAudioProvider';
import { analyzeWaveformInWorker, canUseMediaAnalysisWorker } from './mediaAnalysisWorkerClient';
import {
  accumulateWaveformPeaks,
  clampWaveformPeak,
  parseWaveformCache,
  waveformBinCount,
  type WaveformData,
} from './waveformMath';

export { accumulateWaveformPeaks, parseWaveformCache, waveformBinCount } from './waveformMath';
export type { WaveformData } from './waveformMath';

export interface WaveformOptions {
  samplesPerSecond?: number;
  maxBins?: number;
  chunkSeconds?: number;
  signal?: AbortSignal;
  readBlob?: (asset: AssetMeta) => Promise<Blob>;
  readCache?: (key: string) => Promise<string | null>;
  writeCache?: (key: string, json: string) => Promise<void>;
}

const memoryCache = new Map<string, WaveformData>();

export function waveformFingerprint(asset: AssetMeta) {
  return asset.hash || `${asset.storageName}:${asset.size}:${asset.duration}`;
}

export function waveformCacheKey(asset: AssetMeta, samplesPerSecond = 48, maxBins = 12_000) {
  const rate = Math.max(4, Math.min(240, Math.round(samplesPerSecond)));
  const bins = Math.max(64, Math.round(maxBins));
  return `v1:${asset.id}:${waveformFingerprint(asset)}:${rate}:${bins}`;
}

export function waveformWorkerKey(asset: AssetMeta, samplesPerSecond = 48, maxBins = 12_000) {
  const rate = Math.max(4, Math.min(240, Math.round(samplesPerSecond)));
  const bins = Math.max(64, Math.round(maxBins));
  return `${asset.id}:waveform:${waveformFingerprint(asset)}:${rate}:${bins}`;
}

export async function getAssetWaveform(asset: AssetMeta, options: WaveformOptions = {}): Promise<WaveformData | null> {
  if (asset.kind === 'image' || !Number.isFinite(asset.duration) || asset.duration <= 0) return null;
  const samplesPerSecond = Math.max(4, Math.min(240, Math.round(options.samplesPerSecond ?? 48)));
  const maxBins = Math.max(64, Math.round(options.maxBins ?? 12_000));
  const fingerprint = waveformFingerprint(asset);
  const cacheKey = waveformCacheKey(asset, samplesPerSecond, maxBins);
  const memory = memoryCache.get(cacheKey);
  if (memory) return memory;

  const readCache = options.readCache ?? readWaveformCache;
  try {
    const cached = parseWaveformCache(await readCache(cacheKey), fingerprint, asset.duration, samplesPerSecond, maxBins);
    if (cached) {
      memoryCache.set(cacheKey, cached);
      return cached;
    }
  } catch {
    // Cache is optional. Decode again when OPFS or cached data is unavailable.
  }

  throwIfAborted(options.signal);
  const blob = await (options.readBlob ?? defaultReadBlob)(asset);
  throwIfAborted(options.signal);
  const chunkSeconds = Math.max(5, Math.min(120, options.chunkSeconds ?? 30));

  let peaks: number[] | null = null;
  if (canUseMediaAnalysisWorker()) {
    try {
      peaks = await analyzeWaveformInWorker(waveformWorkerKey(asset, samplesPerSecond, maxBins), blob, {
        duration: asset.duration,
        samplesPerSecond,
        maxBins,
        chunkSeconds,
        signal: options.signal,
      });
    } catch (error) {
      if (isAbortError(error, options.signal)) throw error;
      if (isNoAudioTrackError(error)) return null;
      console.warn('Media analysis worker failed; using the main-thread waveform fallback', error);
    }
  }

  if (!peaks) {
    peaks = await analyzeWaveformOnMainThread(blob, asset.duration, samplesPerSecond, maxBins, chunkSeconds, options.signal);
    if (!peaks) return null;
  }

  const result: WaveformData = {
    version: 1,
    fingerprint,
    duration: asset.duration,
    samplesPerSecond,
    peaks,
  };
  memoryCache.set(cacheKey, result);

  const writeCache = options.writeCache ?? saveWaveformCache;
  try {
    await writeCache(cacheKey, JSON.stringify(result));
  } catch {
    // Persistent cache failure must not make the editor unusable.
  }
  return result;
}

async function analyzeWaveformOnMainThread(
  blob: Blob,
  duration: number,
  samplesPerSecond: number,
  maxBins: number,
  chunkSeconds: number,
  signal?: AbortSignal,
) {
  const provider = new MediabunnyAudioProvider(blob, { maxCacheSize: 8 * 1024 * 1024 });

  try {
    await provider.open(signal);
  } catch (error) {
    provider.close();
    if (isNoAudioTrackError(error)) return null;
    throw error;
  }

  const binCount = waveformBinCount(duration, samplesPerSecond, maxBins);
  const peaks = new Float32Array(binCount);

  try {
    for (let start = 0; start < duration; start += chunkSeconds) {
      throwIfAborted(signal);
      const end = Math.min(duration, start + chunkSeconds);
      const buffers = await provider.readRange(start, end, signal);
      for (const wrapped of buffers) {
        const channels = Array.from(
          { length: wrapped.buffer.numberOfChannels },
          (_, channel) => wrapped.buffer.getChannelData(channel),
        );
        accumulateWaveformPeaks(
          peaks,
          duration,
          channels,
          wrapped.buffer.sampleRate,
          wrapped.timestamp,
          start,
          end,
        );
      }
    }
  } finally {
    provider.close();
  }

  return Array.from(peaks, clampWaveformPeak);
}

export function clearWaveformMemoryCache(assetId?: string) {
  if (!assetId) {
    memoryCache.clear();
    return;
  }
  for (const key of memoryCache.keys()) {
    if (key.startsWith(`v1:${assetId}:`)) memoryCache.delete(key);
  }
}

async function defaultReadBlob(asset: AssetMeta) {
  if (asset.objectUrl) {
    const response = await fetch(asset.objectUrl);
    if (!response.ok) throw new Error(`Failed to read media for waveform: ${response.status}`);
    return response.blob();
  }
  return readAssetFile(asset.storageName);
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  if (reason instanceof Error) throw reason;
  throw new DOMException(typeof reason === 'string' ? reason : 'Operation aborted', 'AbortError');
}

function isNoAudioTrackError(error: unknown) {
  return error instanceof Error && error.message === 'Media has no audio track';
}

function isAbortError(error: unknown, signal?: AbortSignal) {
  return signal?.aborted || (error instanceof DOMException && error.name === 'AbortError');
}
