import { MediabunnyAudioProvider } from './mediabunnyAudioProvider';
import { MediabunnyVideoProvider } from './mediabunnyProvider';
import { pruneIdleMediaProviders, type MediaProviderEntry } from './mediaAnalysisProviderPool';
import {
  TIMELINE_THUMBNAIL_HEIGHT,
  TIMELINE_THUMBNAIL_WIDTH,
  mediaAnalysisClearMatches,
  mediaAnalysisWorkerError,
  mediaAnalysisWorkerErrorName,
  type MediaAnalysisWorkerRequest,
  type MediaAnalysisWorkerResponse,
  type MediaAnalysisKind,
  type MediaThumbnailRequest,
  type MediaWaveformRequest,
} from './mediaAnalysisWorkerProtocol';
import { accumulateWaveformPeaks, clampWaveformPeak, waveformBinCount } from './waveformMath';

const MAX_VIDEO_PROVIDERS = 4;
const MAX_AUDIO_PROVIDERS = 4;
const videoProviders = new Map<string, MediaProviderEntry<MediabunnyVideoProvider>>();
const audioProviders = new Map<string, MediaProviderEntry<MediabunnyAudioProvider>>();
const active = new Map<number, {
  assetKey: string;
  mediaKind: MediaAnalysisKind;
  controller: AbortController;
}>();
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<MediaAnalysisWorkerRequest>) => void) | null;
  postMessage: (response: MediaAnalysisWorkerResponse) => void;
};

scope.onmessage = (event) => {
  const request = event.data;
  if (request.kind === 'cancel') {
    active.get(request.id)?.controller.abort('Media analysis cancelled');
    return;
  }
  if (request.kind === 'clear') {
    clearResources(request.assetId, request.mediaKind);
    return;
  }

  const controller = new AbortController();
  active.set(request.id, { assetKey: request.assetKey, mediaKind: request.kind, controller });
  const task = request.kind === 'thumbnail'
    ? renderThumbnail(request, controller.signal)
    : analyzeWaveform(request, controller.signal);
  void task
    .then((response) => scope.postMessage(response))
    .catch((error) => scope.postMessage({
      id: request.id,
      kind: request.kind,
      ok: false,
      error: mediaAnalysisWorkerError(error),
      errorName: mediaAnalysisWorkerErrorName(error),
    }))
    .finally(() => active.delete(request.id));
};

async function renderThumbnail(request: MediaThumbnailRequest, signal: AbortSignal): Promise<MediaAnalysisWorkerResponse> {
  const lease = await acquireVideoProvider(request.assetKey, request.blob, signal);
  try {
    const sample = await lease.provider.getFrameAt(Math.max(0, request.timeSeconds), signal);
    if (!sample) return { id: request.id, kind: 'thumbnail', ok: true, blob: null };
    try {
      const canvas = new OffscreenCanvas(TIMELINE_THUMBNAIL_WIDTH, TIMELINE_THUMBNAIL_HEIGHT);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Media analysis worker could not create a 2D context');
      const sourceWidth = Math.max(1, sample.displayWidth);
      const sourceHeight = Math.max(1, sample.displayHeight);
      const scale = Math.max(TIMELINE_THUMBNAIL_WIDTH / sourceWidth, TIMELINE_THUMBNAIL_HEIGHT / sourceHeight);
      const cropWidth = TIMELINE_THUMBNAIL_WIDTH / scale;
      const cropHeight = TIMELINE_THUMBNAIL_HEIGHT / scale;
      const sx = Math.max(0, (sourceWidth - cropWidth) / 2);
      const sy = Math.max(0, (sourceHeight - cropHeight) / 2);
      sample.draw(context, sx, sy, cropWidth, cropHeight, 0, 0, TIMELINE_THUMBNAIL_WIDTH, TIMELINE_THUMBNAIL_HEIGHT);
      const blob = await canvas.convertToBlob({ type: 'image/webp', quality: 0.72 });
      throwIfAborted(signal);
      return { id: request.id, kind: 'thumbnail', ok: true, blob };
    } finally {
      sample.close();
    }
  } finally {
    lease.release();
  }
}

async function analyzeWaveform(request: MediaWaveformRequest, signal: AbortSignal): Promise<MediaAnalysisWorkerResponse> {
  const lease = await acquireAudioProvider(request.assetKey, request.blob, signal);
  try {
    const peaks = new Float32Array(waveformBinCount(request.duration, request.samplesPerSecond, request.maxBins));
    const chunkSeconds = Math.max(5, Math.min(120, request.chunkSeconds));

    for (let start = 0; start < request.duration; start += chunkSeconds) {
      throwIfAborted(signal);
      const end = Math.min(request.duration, start + chunkSeconds);
      const buffers = await lease.provider.readRange(start, end, signal);
      for (const wrapped of buffers) {
        const channels = Array.from(
          { length: wrapped.buffer.numberOfChannels },
          (_, channel) => wrapped.buffer.getChannelData(channel),
        );
        accumulateWaveformPeaks(peaks, request.duration, channels, wrapped.buffer.sampleRate, wrapped.timestamp, start, end);
      }
    }

    return {
      id: request.id,
      kind: 'waveform',
      ok: true,
      peaks: Array.from(peaks, clampWaveformPeak),
    };
  } finally {
    lease.release();
  }
}

async function acquireVideoProvider(assetKey: string, blob: Blob, signal: AbortSignal) {
  const existing = videoProviders.get(assetKey);
  if (existing) {
    existing.lastUsed = now();
    existing.activeCount += 1;
    return providerLease(videoProviders, assetKey, existing, MAX_VIDEO_PROVIDERS);
  }
  const provider = new MediabunnyVideoProvider(blob, { maxCacheSize: 12 * 1024 * 1024, hardwareAcceleration: 'prefer-hardware' });
  try {
    await provider.open(signal);
  } catch (error) {
    provider.close();
    throw error;
  }
  const raced = videoProviders.get(assetKey);
  if (raced) {
    provider.close();
    raced.lastUsed = now();
    raced.activeCount += 1;
    return providerLease(videoProviders, assetKey, raced, MAX_VIDEO_PROVIDERS);
  }
  const entry = { provider, lastUsed: now(), activeCount: 1 };
  videoProviders.set(assetKey, entry);
  pruneIdleMediaProviders(videoProviders, MAX_VIDEO_PROVIDERS, assetKey);
  return providerLease(videoProviders, assetKey, entry, MAX_VIDEO_PROVIDERS);
}

async function acquireAudioProvider(assetKey: string, blob: Blob, signal: AbortSignal) {
  const existing = audioProviders.get(assetKey);
  if (existing) {
    existing.lastUsed = now();
    existing.activeCount += 1;
    return providerLease(audioProviders, assetKey, existing, MAX_AUDIO_PROVIDERS);
  }
  const provider = new MediabunnyAudioProvider(blob, { maxCacheSize: 8 * 1024 * 1024 });
  try {
    await provider.open(signal);
  } catch (error) {
    provider.close();
    throw error;
  }
  const raced = audioProviders.get(assetKey);
  if (raced) {
    provider.close();
    raced.lastUsed = now();
    raced.activeCount += 1;
    return providerLease(audioProviders, assetKey, raced, MAX_AUDIO_PROVIDERS);
  }
  const entry = { provider, lastUsed: now(), activeCount: 1 };
  audioProviders.set(assetKey, entry);
  pruneIdleMediaProviders(audioProviders, MAX_AUDIO_PROVIDERS, assetKey);
  return providerLease(audioProviders, assetKey, entry, MAX_AUDIO_PROVIDERS);
}

function providerLease<T extends { close(): void }>(
  providers: Map<string, MediaProviderEntry<T>>,
  assetKey: string,
  entry: MediaProviderEntry<T>,
  max: number,
) {
  let released = false;
  return {
    provider: entry.provider,
    release() {
      if (released) return;
      released = true;
      entry.activeCount = Math.max(0, entry.activeCount - 1);
      entry.lastUsed = now();
      pruneIdleMediaProviders(providers, max, assetKey);
    },
  };
}

function clearResources(assetId?: string, mediaKind?: MediaAnalysisKind) {
  for (const [id, request] of active) {
    if (mediaAnalysisClearMatches({ kind: 'clear', assetId, mediaKind }, request.assetKey, request.mediaKind)) {
      request.controller.abort('Media analysis resources cleared');
      active.delete(id);
    }
  }
  if (!mediaKind || mediaKind === 'thumbnail') clearProviders(videoProviders, assetId);
  if (!mediaKind || mediaKind === 'waveform') clearProviders(audioProviders, assetId);
}

function clearProviders<T extends { close(): void }>(providers: Map<string, MediaProviderEntry<T>>, assetId?: string) {
  for (const [key, entry] of providers) {
    if (!assetId || key.startsWith(`${assetId}:`)) {
      entry.provider.close();
      providers.delete(key);
    }
  }
}

function throwIfAborted(signal: AbortSignal) {
  if (!signal.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException(typeof signal.reason === 'string' ? signal.reason : 'Operation aborted', 'AbortError');
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
