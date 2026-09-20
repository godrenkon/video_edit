import { MediabunnyVideoProvider } from './mediabunnyProvider';
import {
  TIMELINE_THUMBNAIL_HEIGHT,
  TIMELINE_THUMBNAIL_WIDTH,
  thumbnailWorkerError,
  type ThumbnailWorkerRequest,
  type ThumbnailWorkerResponse,
} from './thumbnailWorkerProtocol';

interface ProviderEntry {
  provider: MediabunnyVideoProvider;
  lastUsed: number;
}

const MAX_PROVIDERS = 4;
const providers = new Map<string, ProviderEntry>();
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ThumbnailWorkerRequest>) => void) | null;
  postMessage: (response: ThumbnailWorkerResponse) => void;
};

scope.onmessage = (event) => {
  const request = event.data;
  if (request.kind === 'clear') {
    clearProviders(request.assetId);
    return;
  }
  void renderThumbnail(request)
    .then((blob) => scope.postMessage({ id: request.id, ok: true, blob }))
    .catch((error) => scope.postMessage({ id: request.id, ok: false, error: thumbnailWorkerError(error) }));
};

async function renderThumbnail(request: Extract<ThumbnailWorkerRequest, { kind: 'render' }>) {
  const provider = await getProvider(request.assetKey, request.blob);
  const sample = await provider.getFrameAt(Math.max(0, request.timeSeconds));
  if (!sample) return null;
  try {
    const canvas = new OffscreenCanvas(TIMELINE_THUMBNAIL_WIDTH, TIMELINE_THUMBNAIL_HEIGHT);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Timeline thumbnail worker could not create a 2D context');

    const sourceWidth = Math.max(1, sample.displayWidth);
    const sourceHeight = Math.max(1, sample.displayHeight);
    const scale = Math.max(TIMELINE_THUMBNAIL_WIDTH / sourceWidth, TIMELINE_THUMBNAIL_HEIGHT / sourceHeight);
    const cropWidth = TIMELINE_THUMBNAIL_WIDTH / scale;
    const cropHeight = TIMELINE_THUMBNAIL_HEIGHT / scale;
    const sx = Math.max(0, (sourceWidth - cropWidth) / 2);
    const sy = Math.max(0, (sourceHeight - cropHeight) / 2);
    sample.draw(
      context,
      sx,
      sy,
      cropWidth,
      cropHeight,
      0,
      0,
      TIMELINE_THUMBNAIL_WIDTH,
      TIMELINE_THUMBNAIL_HEIGHT,
    );
    return canvas.convertToBlob({ type: 'image/webp', quality: 0.72 });
  } finally {
    sample.close();
  }
}

async function getProvider(assetKey: string, blob: Blob) {
  const existing = providers.get(assetKey);
  if (existing) {
    existing.lastUsed = now();
    return existing.provider;
  }

  const provider = new MediabunnyVideoProvider(blob, {
    maxCacheSize: 12 * 1024 * 1024,
    hardwareAcceleration: 'prefer-hardware',
  });
  await provider.open();
  providers.set(assetKey, { provider, lastUsed: now() });
  pruneProviders(assetKey);
  return provider;
}

function pruneProviders(currentKey: string) {
  if (providers.size <= MAX_PROVIDERS) return;
  const candidates = [...providers.entries()]
    .filter(([key]) => key !== currentKey)
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  for (const [key, entry] of candidates.slice(0, providers.size - MAX_PROVIDERS)) {
    entry.provider.close();
    providers.delete(key);
  }
}

function clearProviders(assetId?: string) {
  for (const [key, entry] of providers) {
    if (!assetId || key.startsWith(`${assetId}:`)) {
      entry.provider.close();
      providers.delete(key);
    }
  }
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
