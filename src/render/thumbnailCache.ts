import { readAssetFile } from '../core/storage';
import type { AssetMeta } from '../types/editor';
import { MediabunnyVideoProvider } from './mediabunnyProvider';

const MAX_THUMBNAILS = 96;
const MAX_PROVIDERS = 4;
const THUMB_WIDTH = 192;
const THUMB_HEIGHT = 108;

interface CachedThumbnail {
  url: string;
  lastUsed: number;
}

interface CachedProvider {
  provider: MediabunnyVideoProvider;
  lastUsed: number;
}

const thumbnails = new Map<string, CachedThumbnail>();
const providers = new Map<string, CachedProvider>();
const pending = new Map<string, Promise<string | null>>();
let queue = Promise.resolve();

export function videoThumbnailFingerprint(asset: AssetMeta) {
  return [asset.id, asset.hash ?? '', asset.proxyStorageName ?? asset.storageName, asset.size, asset.duration].join(':');
}

export function timelineThumbnailKey(asset: AssetMeta, sourceTime: number) {
  const safe = Math.max(0, Math.min(asset.duration || sourceTime, sourceTime));
  const bucket = Math.round(safe * 4) / 4;
  return `${videoThumbnailFingerprint(asset)}:${bucket.toFixed(2)}`;
}

export function getTimelineThumbnail(asset: AssetMeta, sourceTime: number): Promise<string | null> {
  if (asset.kind !== 'video') return Promise.resolve(null);
  const key = timelineThumbnailKey(asset, sourceTime);
  const cached = thumbnails.get(key);
  if (cached) {
    cached.lastUsed = performanceNow();
    return Promise.resolve(cached.url);
  }

  const existing = pending.get(key);
  if (existing) return existing;

  const task = enqueue(async () => {
    const secondRead = thumbnails.get(key);
    if (secondRead) {
      secondRead.lastUsed = performanceNow();
      return secondRead.url;
    }

    const provider = await getProvider(asset);
    const sample = await provider.getFrameAt(Math.max(0, Math.min(asset.duration || sourceTime, sourceTime)));
    if (!sample) return null;
    try {
      const blob = await drawSampleToBlob(sample);
      if (!blob) return null;
      const url = URL.createObjectURL(blob);
      thumbnails.set(key, { url, lastUsed: performanceNow() });
      pruneThumbnails();
      return url;
    } finally {
      sample.close();
    }
  });

  pending.set(key, task);
  void task.finally(() => {
    if (pending.get(key) === task) pending.delete(key);
  });
  return task;
}

export function clearTimelineThumbnailCache(assetId?: string) {
  for (const [key, cached] of thumbnails) {
    if (!assetId || key.startsWith(`${assetId}:`)) {
      URL.revokeObjectURL(cached.url);
      thumbnails.delete(key);
    }
  }
  if (assetId) {
    const entry = providers.get(assetId);
    entry?.provider.close();
    providers.delete(assetId);
  } else {
    for (const entry of providers.values()) entry.provider.close();
    providers.clear();
  }
}

async function getProvider(asset: AssetMeta) {
  const existing = providers.get(asset.id);
  if (existing) {
    existing.lastUsed = performanceNow();
    return existing.provider;
  }

  const file = await readAssetFile(asset.proxyStorageName ?? asset.storageName);
  const provider = new MediabunnyVideoProvider(file, {
    maxCacheSize: 12 * 1024 * 1024,
    hardwareAcceleration: 'prefer-hardware',
  });
  await provider.open();
  providers.set(asset.id, { provider, lastUsed: performanceNow() });
  pruneProviders(asset.id);
  return provider;
}

async function drawSampleToBlob(sample: Awaited<ReturnType<MediabunnyVideoProvider['getFrameAt']>>) {
  if (!sample) return null;
  const canvas = createCanvas(THUMB_WIDTH, THUMB_HEIGHT);
  const context = canvas.getContext('2d');
  if (!context || !('drawImage' in context)) return null;

  const sourceWidth = Math.max(1, sample.displayWidth);
  const sourceHeight = Math.max(1, sample.displayHeight);
  const scale = Math.max(THUMB_WIDTH / sourceWidth, THUMB_HEIGHT / sourceHeight);
  const cropWidth = THUMB_WIDTH / scale;
  const cropHeight = THUMB_HEIGHT / scale;
  const sx = Math.max(0, (sourceWidth - cropWidth) / 2);
  const sy = Math.max(0, (sourceHeight - cropHeight) / 2);
  sample.draw(
    context as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
    sx,
    sy,
    cropWidth,
    cropHeight,
    0,
    0,
    THUMB_WIDTH,
    THUMB_HEIGHT,
  );

  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) return canvas.convertToBlob({ type: 'image/webp', quality: 0.72 });
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', 0.72));
}

function createCanvas(width: number, height: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function pruneThumbnails() {
  if (thumbnails.size <= MAX_THUMBNAILS) return;
  const ordered = [...thumbnails.entries()].sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  for (const [key, cached] of ordered.slice(0, thumbnails.size - MAX_THUMBNAILS)) {
    URL.revokeObjectURL(cached.url);
    thumbnails.delete(key);
  }
}

function pruneProviders(currentAssetId: string) {
  if (providers.size <= MAX_PROVIDERS) return;
  const candidates = [...providers.entries()]
    .filter(([assetId]) => assetId !== currentAssetId)
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  for (const [assetId, entry] of candidates.slice(0, providers.size - MAX_PROVIDERS)) {
    entry.provider.close();
    providers.delete(assetId);
  }
}

function enqueue<T>(work: () => Promise<T>) {
  const result = queue.then(work, work);
  queue = result.then(() => undefined, () => undefined);
  return result;
}

function performanceNow() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
