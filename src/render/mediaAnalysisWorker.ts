import { MediabunnyAudioProvider } from './mediabunnyAudioProvider';
import { MediabunnyVideoProvider } from './mediabunnyProvider';
import {
  TIMELINE_THUMBNAIL_HEIGHT,
  TIMELINE_THUMBNAIL_WIDTH,
  mediaAnalysisWorkerError,
  type MediaAnalysisWorkerRequest,
  type MediaAnalysisWorkerResponse,
  type MediaThumbnailRequest,
  type MediaWaveformRequest,
} from './mediaAnalysisWorkerProtocol';
import { accumulateWaveformPeaks, clampWaveformPeak, waveformBinCount } from './waveformMath';

interface ProviderEntry<T> {
  provider: T;
  lastUsed: number;
}

const MAX_VIDEO_PROVIDERS = 4;
const MAX_AUDIO_PROVIDERS = 4;
const videoProviders = new Map<string, ProviderEntry<MediabunnyVideoProvider>>();
const audioProviders = new Map<string, ProviderEntry<MediabunnyAudioProvider>>();
const active = new Map<number, { assetKey: string; controller: AbortController }>();
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
    clearResources(request.assetId);
    return;
  }

  const controller = new AbortController();
  active.set(request.id, { assetKey: request.assetKey, controller });
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
    }))
    .finally(() => active.delete(request.id));
};

async function renderThumbnail(request: MediaThumbnailRequest, signal: AbortSignal): Promise<MediaAnalysisWorkerResponse> {
  const provider = await getVideoProvider(request.assetKey, request.blob, signal);
  const sample = await provider.getFrameAt(Math.max(0, request.timeSeconds), signal);
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
}

async function analyzeWaveform(request: MediaWaveformRequest, signal: AbortSignal): Promise<MediaAnalysisWorkerResponse> {
  const provider = await getAudioProvider(request.assetKey, request.blob, signal);
  const peaks = new Float32Array(waveformBinCount(request.duration, request.samplesPerSecond, request.maxBins));
  const chunkSeconds = Math.max(5, Math.min(120, request.chunkSeconds));

  for (let start = 0; start < request.duration; start += chunkSeconds) {
    throwIfAborted(signal);
    const end = Math.min(request.duration, start + chunkSeconds);
    const buffers = await provider.readRange(start, end, signal);
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
}

async function getVideoProvider(assetKey: string, blob: Blob, signal: AbortSignal) {
  const existing = videoProviders.get(assetKey);
  if (existing) {
    existing.lastUsed = now();
    return existing.provider;
  }
  const provider = new MediabunnyVideoProvider(blob, { maxCacheSize: 12 * 1024 * 1024, hardwareAcceleration: 'prefer-hardware' });
  await provider.open(signal);
  videoProviders.set(assetKey, { provider, lastUsed: now() });
  pruneProviders(videoProviders, assetKey, MAX_VIDEO_PROVIDERS);
  return provider;
}

async function getAudioProvider(assetKey: string, blob: Blob, signal: AbortSignal) {
  const existing = audioProviders.get(assetKey);
  if (existing) {
    existing.lastUsed = now();
    return existing.provider;
  }
  const provider = new MediabunnyAudioProvider(blob, { maxCacheSize: 8 * 1024 * 1024 });
  await provider.open(signal);
  audioProviders.set(assetKey, { provider, lastUsed: now() });
  pruneProviders(audioProviders, assetKey, MAX_AUDIO_PROVIDERS);
  return provider;
}

function pruneProviders<T extends { close(): void }>(providers: Map<string, ProviderEntry<T>>, currentKey: string, max: number) {
  if (providers.size <= max) return;
  const candidates = [...providers.entries()]
    .filter(([key]) => key !== currentKey)
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  for (const [key, entry] of candidates.slice(0, providers.size - max)) {
    entry.provider.close();
    providers.delete(key);
  }
}

function clearResources(assetId?: string) {
  for (const [id, request] of active) {
    if (!assetId || request.assetKey.startsWith(`${assetId}:`)) {
      request.controller.abort('Media analysis resources cleared');
      active.delete(id);
    }
  }
  clearProviders(videoProviders, assetId);
  clearProviders(audioProviders, assetId);
}

function clearProviders<T extends { close(): void }>(providers: Map<string, ProviderEntry<T>>, assetId?: string) {
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
