import { readAssetFile, readWaveformCache, saveWaveformCache } from '../core/storage';
import type { AssetMeta } from '../types/editor';
import { MediabunnyAudioProvider } from './mediabunnyAudioProvider';

export interface WaveformData {
  version: 1;
  fingerprint: string;
  duration: number;
  samplesPerSecond: number;
  peaks: number[];
}

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

export function waveformBinCount(duration: number, samplesPerSecond = 48, maxBins = 12_000) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const rate = Math.max(4, Math.min(240, Math.round(samplesPerSecond)));
  return Math.max(1, Math.min(Math.max(64, Math.round(maxBins)), Math.ceil(duration * rate)));
}

export async function getAssetWaveform(asset: AssetMeta, options: WaveformOptions = {}): Promise<WaveformData | null> {
  if (asset.kind === 'image' || !Number.isFinite(asset.duration) || asset.duration <= 0) return null;
  const samplesPerSecond = Math.max(4, Math.min(240, Math.round(options.samplesPerSecond ?? 48)));
  const maxBins = Math.max(64, Math.round(options.maxBins ?? 12_000));
  const fingerprint = waveformFingerprint(asset);
  const cacheKey = `v1:${asset.id}:${fingerprint}:${samplesPerSecond}:${maxBins}`;
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
  const provider = new MediabunnyAudioProvider(blob, { maxCacheSize: 8 * 1024 * 1024 });

  try {
    await provider.open(options.signal);
  } catch (error) {
    provider.close();
    if (error instanceof Error && error.message === 'Media has no audio track') return null;
    throw error;
  }

  const binCount = waveformBinCount(asset.duration, samplesPerSecond, maxBins);
  const peaks = new Float32Array(binCount);
  const chunkSeconds = Math.max(5, Math.min(120, options.chunkSeconds ?? 30));

  try {
    for (let start = 0; start < asset.duration; start += chunkSeconds) {
      throwIfAborted(options.signal);
      const end = Math.min(asset.duration, start + chunkSeconds);
      const buffers = await provider.readRange(start, end, options.signal);
      for (const wrapped of buffers) {
        const channels = Array.from(
          { length: wrapped.buffer.numberOfChannels },
          (_, channel) => wrapped.buffer.getChannelData(channel),
        );
        accumulateWaveformPeaks(
          peaks,
          asset.duration,
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

  const result: WaveformData = {
    version: 1,
    fingerprint,
    duration: asset.duration,
    samplesPerSecond,
    peaks: Array.from(peaks, (value) => clamp(value, 0, 1)),
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

export function accumulateWaveformPeaks(
  peaks: Float32Array,
  duration: number,
  channels: Float32Array[],
  sampleRate: number,
  bufferTimestamp: number,
  rangeStart = 0,
  rangeEnd = duration,
) {
  if (peaks.length === 0 || channels.length === 0 || !Number.isFinite(duration) || duration <= 0 || sampleRate <= 0) return;
  const frameCount = Math.min(...channels.map((channel) => channel.length));
  const safeStart = Math.max(0, rangeStart);
  const safeEnd = Math.min(duration, Math.max(safeStart, rangeEnd));

  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = bufferTimestamp + frame / sampleRate;
    if (time < safeStart || time >= safeEnd || time < 0 || time >= duration) continue;
    let peak = 0;
    for (const channel of channels) peak = Math.max(peak, Math.abs(channel[frame] ?? 0));
    const index = Math.min(peaks.length - 1, Math.floor(time / duration * peaks.length));
    if (peak > peaks[index]) peaks[index] = peak;
  }
}

export function parseWaveformCache(
  json: string | null,
  fingerprint: string,
  duration: number,
  samplesPerSecond: number,
  maxBins: number,
): WaveformData | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as Partial<WaveformData>;
    if (value.version !== 1 || value.fingerprint !== fingerprint) return null;
    if (!Number.isFinite(value.duration) || Math.abs(Number(value.duration) - duration) > 0.001) return null;
    if (value.samplesPerSecond !== samplesPerSecond || !Array.isArray(value.peaks)) return null;
    const expected = waveformBinCount(duration, samplesPerSecond, maxBins);
    if (value.peaks.length !== expected) return null;
    if (!value.peaks.every((peak) => typeof peak === 'number' && Number.isFinite(peak) && peak >= 0 && peak <= 1)) return null;
    return value as WaveformData;
  } catch {
    return null;
  }
}

export function clearWaveformMemoryCache() {
  memoryCache.clear();
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

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
