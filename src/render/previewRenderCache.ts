import type { Project } from '../types/editor';
import { Canvas2DProjectRenderer, type RenderCanvas } from './canvas2dRenderer';
import { RenderAssetStore } from './renderAssetStore';

const DEFAULT_MAX_WIDTH = 960;
const DEFAULT_MAX_HEIGHT = 540;
const DEFAULT_MAX_BYTES = 32 * 1024 * 1024;

interface CacheEntry {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  bytes: number;
  lastUsed: number;
}

export interface PreviewRenderCacheOptions {
  maxWidth?: number;
  maxHeight?: number;
  maxBytes?: number;
  videoCacheBytes?: number;
}

export interface PreviewCachedFrame {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  frameIndex: number;
  time: number;
  cached: boolean;
}

export class PreviewRenderCache {
  private readonly assets: RenderAssetStore;
  private readonly renderCanvas: RenderCanvas;
  private readonly renderer: Canvas2DProjectRenderer;
  private readonly scaleCanvas: RenderCanvas;
  private readonly maxWidth: number;
  private readonly maxHeight: number;
  private readonly maxBytes: number;
  private readonly entries = new Map<number, CacheEntry>();
  private readonly pending = new Map<number, Promise<PreviewCachedFrame>>();
  private closed = false;

  constructor(project: Pick<Project, 'assets'>, options: PreviewRenderCacheOptions = {}) {
    this.maxWidth = positiveInt(options.maxWidth, DEFAULT_MAX_WIDTH);
    this.maxHeight = positiveInt(options.maxHeight, DEFAULT_MAX_HEIGHT);
    this.maxBytes = positiveInt(options.maxBytes, DEFAULT_MAX_BYTES);
    this.assets = new RenderAssetStore(project.assets, {
      preferProxy: true,
      videoCacheBytes: options.videoCacheBytes ?? 18 * 1024 * 1024,
    });
    this.renderCanvas = createRenderCanvas(16, 16);
    this.scaleCanvas = createRenderCanvas(16, 16);
    this.renderer = new Canvas2DProjectRenderer(this.renderCanvas, this.assets);
  }

  async frame(project: Project, timeSeconds: number, signal?: AbortSignal): Promise<PreviewCachedFrame> {
    this.assertOpen();
    const frameIndex = previewCacheFrameIndex(timeSeconds, project.fps, project.duration);
    const frameTime = frameIndex / Math.max(1, Math.round(project.fps || 1));
    const cached = this.entries.get(frameIndex);
    if (cached) {
      cached.lastUsed = now();
      return {
        bitmap: cached.bitmap,
        width: cached.width,
        height: cached.height,
        frameIndex,
        time: frameTime,
        cached: true,
      };
    }

    const existing = this.pending.get(frameIndex);
    if (existing) return existing;

    const task = this.renderFrame(project, frameIndex, frameTime, signal);
    this.pending.set(frameIndex, task);
    void task.finally(() => {
      if (this.pending.get(frameIndex) === task) this.pending.delete(frameIndex);
    });
    return task;
  }

  clear() {
    for (const entry of this.entries.values()) entry.bitmap.close();
    this.entries.clear();
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.clear();
    this.pending.clear();
    await this.assets.close();
  }

  private async renderFrame(
    project: Project,
    frameIndex: number,
    frameTime: number,
    signal?: AbortSignal,
  ): Promise<PreviewCachedFrame> {
    throwIfAborted(signal);
    await this.renderer.render(project, frameTime, signal);
    throwIfAborted(signal);

    const dimensions = previewCacheDimensions(project.width, project.height, this.maxWidth, this.maxHeight);
    if (this.scaleCanvas.width !== dimensions.width) this.scaleCanvas.width = dimensions.width;
    if (this.scaleCanvas.height !== dimensions.height) this.scaleCanvas.height = dimensions.height;
    const context = this.scaleCanvas.getContext('2d');
    if (!context || !('drawImage' in context)) throw new Error('Preview cache 2D canvas is unavailable');
    const ctx = context as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    ctx.save();
    ctx.resetTransform();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'copy';
    ctx.filter = 'none';
    ctx.drawImage(this.renderCanvas as CanvasImageSource, 0, 0, project.width, project.height, 0, 0, dimensions.width, dimensions.height);
    ctx.restore();

    const bitmap = await canvasToImageBitmap(this.scaleCanvas);
    throwIfAborted(signal);
    const entry: CacheEntry = {
      bitmap,
      width: dimensions.width,
      height: dimensions.height,
      bytes: dimensions.width * dimensions.height * 4,
      lastUsed: now(),
    };
    this.entries.set(frameIndex, entry);
    this.prune(frameIndex);
    return {
      bitmap,
      width: entry.width,
      height: entry.height,
      frameIndex,
      time: frameTime,
      cached: false,
    };
  }

  private prune(keepFrameIndex: number) {
    let total = 0;
    for (const entry of this.entries.values()) total += entry.bytes;
    if (total <= this.maxBytes) return;

    const candidates = [...this.entries.entries()]
      .filter(([frameIndex]) => frameIndex !== keepFrameIndex)
      .sort((a, b) => a[1].lastUsed - b[1].lastUsed);

    for (const [frameIndex, entry] of candidates) {
      if (total <= this.maxBytes) break;
      entry.bitmap.close();
      this.entries.delete(frameIndex);
      total -= entry.bytes;
    }
  }

  private assertOpen() {
    if (this.closed) throw new Error('Preview render cache is closed');
  }
}

export function previewCacheFrameIndex(timeSeconds: number, fps: number, duration: number) {
  const rate = Math.max(1, Math.min(240, Math.round(Number.isFinite(fps) ? fps : 30)));
  const safeDuration = Math.max(0, Number.isFinite(duration) ? duration : 0);
  const safeTime = Math.max(0, Math.min(safeDuration, Number.isFinite(timeSeconds) ? timeSeconds : 0));
  return Math.max(0, Math.round(safeTime * rate));
}

export function previewCacheDimensions(
  width: number,
  height: number,
  maxWidth = DEFAULT_MAX_WIDTH,
  maxHeight = DEFAULT_MAX_HEIGHT,
) {
  const sourceWidth = Math.max(1, Math.round(Number.isFinite(width) ? width : 1));
  const sourceHeight = Math.max(1, Math.round(Number.isFinite(height) ? height : 1));
  const boundWidth = positiveInt(maxWidth, DEFAULT_MAX_WIDTH);
  const boundHeight = positiveInt(maxHeight, DEFAULT_MAX_HEIGHT);
  const scale = Math.min(1, boundWidth / sourceWidth, boundHeight / sourceHeight);
  return {
    width: Math.max(1, Math.round(sourceWidth * scale)),
    height: Math.max(1, Math.round(sourceHeight * scale)),
  };
}

function createRenderCanvas(width: number, height: number): RenderCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document === 'undefined') throw new Error('Canvas is unavailable');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasToImageBitmap(canvas: RenderCanvas) {
  if (typeof OffscreenCanvas !== 'undefined' && canvas instanceof OffscreenCanvas) {
    return canvas.transferToImageBitmap();
  }
  if (typeof createImageBitmap !== 'function') throw new Error('ImageBitmap is unavailable');
  return createImageBitmap(canvas as HTMLCanvasElement);
}

function positiveInt(value: number | undefined, fallback: number) {
  return Math.max(1, Math.round(Number.isFinite(value) ? Number(value) : fallback));
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  if (reason instanceof Error) throw reason;
  throw new DOMException(typeof reason === 'string' ? reason : 'Operation aborted', 'AbortError');
}
