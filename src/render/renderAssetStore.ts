import type { VideoSample } from 'mediabunny';
import { readAssetFile } from '../core/storage';
import type { AssetMeta } from '../types/editor';
import { MediabunnyVideoProvider } from './mediabunnyProvider';

export type RenderAssetFrame =
  | {
      kind: 'video';
      sample: VideoSample;
      width: number;
      height: number;
    }
  | {
      kind: 'image';
      bitmap: ImageBitmap;
      width: number;
      height: number;
    };

export interface RenderAssetStoreOptions {
  readFile?: (storageName: string) => Promise<File>;
  videoCacheBytes?: number;
  preferProxy?: boolean;
}

/**
 * Lazily opens source media and keeps decoder state alive across consecutive
 * frame requests. Video samples are owned by the caller and must be released
 * with releaseFrame(); image bitmaps are cached for the lifetime of the store.
 */
export class RenderAssetStore {
  private readonly assets: Map<string, AssetMeta>;
  private readonly readFile: (storageName: string) => Promise<File>;
  private readonly videoCacheBytes: number;
  private readonly preferProxy: boolean;
  private readonly videoProviders = new Map<string, Promise<MediabunnyVideoProvider>>();
  private readonly imageBitmaps = new Map<string, Promise<ImageBitmap>>();
  private closed = false;

  constructor(assets: AssetMeta[], options: RenderAssetStoreOptions = {}) {
    this.assets = new Map(assets.map((asset) => [asset.id, asset]));
    this.readFile = options.readFile ?? readAssetFile;
    this.videoCacheBytes = options.videoCacheBytes ?? 24 * 1024 * 1024;
    this.preferProxy = options.preferProxy ?? false;
  }

  async getFrame(assetId: string, sourceTime: number, signal?: AbortSignal): Promise<RenderAssetFrame | null> {
    this.assertOpen();
    throwIfAborted(signal);
    const asset = this.assets.get(assetId);
    if (!asset || asset.kind === 'audio') return null;

    if (asset.kind === 'image') {
      const bitmap = await this.getImageBitmap(asset, signal);
      return { kind: 'image', bitmap, width: bitmap.width, height: bitmap.height };
    }

    const provider = await this.getVideoProvider(asset, signal);
    const sample = await provider.getFrameAt(Math.max(0, sourceTime), signal);
    if (!sample) return null;
    return {
      kind: 'video',
      sample,
      width: sample.displayWidth,
      height: sample.displayHeight,
    };
  }

  releaseFrame(frame: RenderAssetFrame | null) {
    if (frame?.kind === 'video') frame.sample.close();
  }

  async close() {
    if (this.closed) return;
    this.closed = true;

    const providers = await Promise.allSettled(this.videoProviders.values());
    for (const result of providers) {
      if (result.status === 'fulfilled') result.value.close();
    }

    const bitmaps = await Promise.allSettled(this.imageBitmaps.values());
    for (const result of bitmaps) {
      if (result.status === 'fulfilled') result.value.close();
    }

    this.videoProviders.clear();
    this.imageBitmaps.clear();
  }

  private getVideoProvider(asset: AssetMeta, signal?: AbortSignal) {
    let pending = this.videoProviders.get(asset.id);
    if (!pending) {
      pending = (async () => {
        const file = await this.readFile(this.preferProxy ? asset.proxyStorageName ?? asset.storageName : asset.storageName);
        throwIfAborted(signal);
        const provider = new MediabunnyVideoProvider(file, { maxCacheSize: this.videoCacheBytes });
        try {
          await provider.open(signal);
          return provider;
        } catch (error) {
          provider.close();
          throw error;
        }
      })();
      this.videoProviders.set(asset.id, pending);
      pending.catch(() => {
        if (this.videoProviders.get(asset.id) === pending) this.videoProviders.delete(asset.id);
      });
    }
    return pending;
  }

  private getImageBitmap(asset: AssetMeta, signal?: AbortSignal) {
    let pending = this.imageBitmaps.get(asset.id);
    if (!pending) {
      pending = (async () => {
        const file = await this.readFile(asset.proxyStorageName ?? asset.storageName);
        throwIfAborted(signal);
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        if (signal?.aborted) {
          bitmap.close();
          throwIfAborted(signal);
        }
        return bitmap;
      })();
      this.imageBitmaps.set(asset.id, pending);
      pending.catch(() => {
        if (this.imageBitmaps.get(asset.id) === pending) this.imageBitmaps.delete(asset.id);
      });
    }
    return pending;
  }

  private assertOpen() {
    if (this.closed) throw new Error('RenderAssetStore is closed');
  }
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  if (reason instanceof Error) throw reason;
  throw new DOMException(typeof reason === 'string' ? reason : 'Operation aborted', 'AbortError');
}
