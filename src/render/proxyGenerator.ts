import {
  ALL_FORMATS,
  BlobSource,
  Conversion,
  getFirstEncodableVideoCodec,
  Input,
  Output,
  Quality,
  StreamTarget,
  type StreamTargetChunk,
  WebMOutputFormat,
} from 'mediabunny';
import { readAssetFile } from '../core/storage';
import type { AssetMeta } from '../types/editor';

const ASSET_DIR = 'assets';

export interface ProxyDimensions {
  width: number;
  height: number;
}

export interface GenerateVideoProxyOptions {
  maxWidth?: number;
  maxHeight?: number;
  frameRate?: number;
  signal?: AbortSignal;
  onProgress?: (progress: number) => void;
}

export interface GeneratedVideoProxy {
  storageName: string;
  file: File;
  width: number;
  height: number;
  codec: string;
}

export function proxyStorageName(assetId: string) {
  return `${assetId}.proxy.webm`;
}

export function resolveProxyDimensions(
  asset: Pick<AssetMeta, 'width' | 'height'>,
  maxWidth = 1280,
  maxHeight = 720,
): ProxyDimensions {
  const sourceWidth = positive(asset.width, 1920);
  const sourceHeight = positive(asset.height, 1080);
  const safeMaxWidth = Math.max(2, Math.floor(positive(maxWidth, 1280)));
  const safeMaxHeight = Math.max(2, Math.floor(positive(maxHeight, 720)));
  const scale = Math.min(1, safeMaxWidth / sourceWidth, safeMaxHeight / sourceHeight);
  return {
    width: evenDimension(sourceWidth * scale),
    height: evenDimension(sourceHeight * scale),
  };
}

export function proxyVideoBitrate(width: number, height: number, frameRate = 30) {
  const pixelsPerSecond = Math.max(1, width) * Math.max(1, height) * Math.max(1, frameRate);
  return Math.round(Math.min(3_500_000, Math.max(600_000, pixelsPerSecond * 0.09)));
}

export async function generateVideoProxy(
  asset: AssetMeta,
  options: GenerateVideoProxyOptions = {},
): Promise<GeneratedVideoProxy> {
  if (asset.kind !== 'video') throw new Error('Proxy generation is available only for video assets.');
  if (!navigator.storage?.getDirectory) throw new Error('OPFS is required for proxy generation.');

  const sourceFile = await readAssetFile(asset.storageName);
  throwIfAborted(options.signal);

  const dimensions = resolveProxyDimensions(asset, options.maxWidth, options.maxHeight);
  const frameRate = Math.max(1, Math.min(60, Math.round(options.frameRate ?? 30)));
  const quality = new Quality({
    bitrate: proxyVideoBitrate(dimensions.width, dimensions.height, frameRate),
  });

  const input = new Input({
    formats: ALL_FORMATS,
    source: new BlobSource(sourceFile),
  });
  const format = new WebMOutputFormat();
  const codec = await getFirstEncodableVideoCodec(
    format.getSupportedVideoCodecs(),
    {
      width: dimensions.width,
      height: dimensions.height,
      frameRate,
      quality,
    },
  );
  if (!codec) throw new Error('No supported WebM video encoder is available for proxy generation.');

  const storageName = proxyStorageName(asset.id);
  const outputTarget = await createAssetStreamTarget(storageName);
  let conversion: Conversion | null = null;
  const onAbort = () => {
    void conversion?.cancel().catch(() => undefined);
  };
  options.signal?.addEventListener('abort', onAbort, { once: true });

  try {
    const output = new Output({
      format,
      target: outputTarget.target,
    });

    conversion = await Conversion.init({
      input,
      output,
      tracks: 'primary',
      copy: false,
      showWarnings: false,
      video: {
        width: dimensions.width,
        height: dimensions.height,
        fit: 'contain',
        frameRate,
        codec,
        quality,
        keyFrameInterval: 1,
        hardwareAcceleration: 'prefer-hardware',
        forceTranscode: true,
      },
      audio: { discard: true },
    });

    if (!conversion.isValid) {
      const reasons = conversion.discardedTracks.map((item) => item.reason).join(', ');
      throw new Error(`Proxy conversion is not supported${reasons ? `: ${reasons}` : ''}.`);
    }

    conversion.onProgress = (progress) => {
      options.onProgress?.(Math.max(0, Math.min(1, progress)));
    };

    throwIfAborted(options.signal);
    await conversion.execute();
    throwIfAborted(options.signal);
    options.onProgress?.(1);

    return {
      storageName,
      file: await outputTarget.getFile(),
      width: dimensions.width,
      height: dimensions.height,
      codec,
    };
  } catch (error) {
    await outputTarget.remove();
    throw error;
  } finally {
    options.signal?.removeEventListener('abort', onAbort);
  }
}

interface AssetStreamTarget {
  target: StreamTarget;
  getFile(): Promise<File>;
  remove(): Promise<void>;
}

async function createAssetStreamTarget(storageName: string): Promise<AssetStreamTarget> {
  const root = await navigator.storage.getDirectory();
  const directory = await root.getDirectoryHandle(ASSET_DIR, { create: true });
  const fileHandle = await directory.getFileHandle(storageName, { create: true });
  const writable = await fileHandle.createWritable({ keepExistingData: false });
  let terminal = false;

  const stream = new WritableStream<StreamTargetChunk>({
    async write(chunk) {
      if (terminal) throw new Error('Proxy output stream is already closed.');
      await writable.write({
        type: 'write',
        position: chunk.position,
        data: chunk.data,
      });
    },
    async close() {
      if (terminal) return;
      terminal = true;
      await writable.close();
    },
    async abort(reason) {
      if (terminal) return;
      terminal = true;
      await writable.abort(reason).catch(() => undefined);
    },
  });

  return {
    target: new StreamTarget(stream),
    getFile: () => fileHandle.getFile(),
    remove: async () => {
      if (!terminal) {
        terminal = true;
        await writable.abort().catch(() => undefined);
      }
      await directory.removeEntry(storageName).catch(() => undefined);
    },
  };
}

function evenDimension(value: number) {
  const rounded = Math.max(2, Math.floor(value));
  return rounded % 2 === 0 ? rounded : rounded - 1;
}

function positive(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  if (reason instanceof Error) throw reason;
  throw new DOMException(typeof reason === 'string' ? reason : 'Operation aborted', 'AbortError');
}
