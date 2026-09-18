import type { Project } from '../types/editor';
import { Canvas2DProjectRenderer, type RenderCanvas } from './canvas2dRenderer';
import { resolveExportDimensions } from './projectExporter';
import { RenderAssetStore } from './renderAssetStore';
import { sanitizeRenderFileName } from './opfsRenderTarget';

export interface PngSequenceProgress {
  completedFrames: number;
  totalFrames: number;
  fraction: number;
  currentTime: number;
}

export interface ProjectPngSequenceOptions {
  directory: FileSystemDirectoryHandle;
  startSeconds?: number;
  endSeconds?: number;
  outputWidth?: number;
  outputHeight?: number;
  prefix?: string;
  signal?: AbortSignal;
  onProgress?: (progress: PngSequenceProgress) => void;
}

export interface ProjectPngSequenceResult {
  folderName: string;
  frameCount: number;
  width: number;
  height: number;
  startSeconds: number;
  endSeconds: number;
}

export function pngSequenceFrameRange(
  fps: number,
  startSeconds: number,
  endSeconds: number,
) {
  const rate = Math.max(1, Math.min(240, Math.round(Number.isFinite(fps) ? fps : 30)));
  const start = Math.max(0, Number.isFinite(startSeconds) ? startSeconds : 0);
  const end = Math.max(start, Number.isFinite(endSeconds) ? endSeconds : start);
  const firstFrame = Math.ceil(start * rate - 1e-9);
  const endFrameExclusive = Math.ceil(end * rate - 1e-9);
  return {
    fps: rate,
    firstFrame,
    endFrameExclusive,
    totalFrames: Math.max(0, endFrameExclusive - firstFrame),
  };
}

export function pngSequenceFileName(prefix: string, sequenceIndex: number, totalFrames: number) {
  const safePrefix = sanitizeRenderFileName(prefix || 'frame').replace(/\.png$/i, '') || 'frame';
  const digits = Math.max(6, String(Math.max(1, totalFrames)).length);
  return `${safePrefix}-${String(Math.max(1, sequenceIndex)).padStart(digits, '0')}.png`;
}

export async function exportProjectPngSequence(
  project: Project,
  options: ProjectPngSequenceOptions,
): Promise<ProjectPngSequenceResult> {
  const savedHeight = project.exportSettings?.outputHeight;
  const dimensions = resolveExportDimensions(project, {
    outputWidth: options.outputWidth,
    outputHeight: options.outputHeight ?? savedHeight,
  });
  const startSeconds = Math.max(0, Math.min(project.duration, options.startSeconds ?? project.inPoint ?? 0));
  const endSeconds = Math.max(
    startSeconds,
    Math.min(project.duration, options.endSeconds ?? project.outPoint ?? project.duration),
  );
  const range = pngSequenceFrameRange(project.fps, startSeconds, endSeconds);
  if (range.totalFrames <= 0) throw new Error('PNG連番の書き出し範囲にフレームがありません。');

  const prefix = sanitizeRenderFileName(options.prefix || project.name || 'frame').replace(/\.png$/i, '') || 'frame';
  const folderName = `${prefix}-png-sequence-${sequenceFolderStamp(new Date())}`;
  const outputDirectory = await options.directory.getDirectoryHandle(folderName, { create: true });
  const sourceCanvas = createCanvas(project.width, project.height);
  const outputCanvas = dimensions.width === project.width && dimensions.height === project.height
    ? sourceCanvas
    : createCanvas(dimensions.width, dimensions.height);
  const assets = new RenderAssetStore(project.assets);
  const renderer = new Canvas2DProjectRenderer(sourceCanvas, assets);

  try {
    for (let offset = 0; offset < range.totalFrames; offset += 1) {
      throwIfAborted(options.signal);
      const absoluteFrame = range.firstFrame + offset;
      const timeSeconds = absoluteFrame / range.fps;
      await renderer.render(project, timeSeconds, options.signal);
      throwIfAborted(options.signal);

      if (outputCanvas !== sourceCanvas) {
        const context = outputCanvas.getContext('2d');
        if (!context || !('drawImage' in context)) throw new Error('PNG連番用Canvas 2D contextを作成できません。');
        context.save();
        context.resetTransform();
        context.clearRect(0, 0, dimensions.width, dimensions.height);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = 'high';
        context.drawImage(sourceCanvas, 0, 0, dimensions.width, dimensions.height);
        context.restore();
      }

      const blob = await canvasToPng(outputCanvas);
      throwIfAborted(options.signal);
      const fileName = pngSequenceFileName(prefix, offset + 1, range.totalFrames);
      const handle = await outputDirectory.getFileHandle(fileName, { create: true });
      const writable = await handle.createWritable({ keepExistingData: false });
      try {
        await writable.write(blob);
        await writable.close();
      } catch (error) {
        await writable.abort(error).catch(() => undefined);
        throw error;
      }

      const completedFrames = offset + 1;
      options.onProgress?.({
        completedFrames,
        totalFrames: range.totalFrames,
        fraction: completedFrames / range.totalFrames,
        currentTime: timeSeconds,
      });
    }

    return {
      folderName,
      frameCount: range.totalFrames,
      width: dimensions.width,
      height: dimensions.height,
      startSeconds,
      endSeconds,
    };
  } finally {
    await assets.close();
  }
}

function createCanvas(width: number, height: number): RenderCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document === 'undefined') throw new Error('Canvas が利用できません。');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

async function canvasToPng(canvas: RenderCanvas) {
  if ('convertToBlob' in canvas && typeof canvas.convertToBlob === 'function') {
    return canvas.convertToBlob({ type: 'image/png' });
  }
  if ('toBlob' in canvas && typeof canvas.toBlob === 'function') {
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG画像を生成できませんでした。')), 'image/png');
    });
  }
  throw new Error('このブラウザではPNG書き出しを利用できません。');
}

function sequenceFolderStamp(date: Date) {
  const pad = (value: number) => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException(typeof signal.reason === 'string' ? signal.reason : 'Operation aborted', 'AbortError');
}
