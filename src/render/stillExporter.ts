import type { Project } from '../types/editor';
import { Canvas2DProjectRenderer, type RenderCanvas } from './canvas2dRenderer';
import { sanitizeRenderFileName } from './opfsRenderTarget';
import { resolveExportDimensions } from './exportDimensions';
import { RenderAssetStore } from './renderAssetStore';

export interface ProjectPngExportOptions {
  fileName?: string;
  outputWidth?: number;
  outputHeight?: number;
  signal?: AbortSignal;
}

export interface ProjectPngExportResult {
  fileName: string;
  mimeType: 'image/png';
  blob: Blob;
  width: number;
  height: number;
  timeSeconds: number;
}

export async function exportProjectPng(
  project: Project,
  timeSeconds: number,
  options: ProjectPngExportOptions = {},
): Promise<ProjectPngExportResult> {
  const clampedTime = clampStillTime(project, timeSeconds);
  const savedHeight = project.exportSettings?.outputHeight;
  const dimensions = resolveExportDimensions(project, {
    outputWidth: options.outputWidth,
    outputHeight: options.outputHeight ?? savedHeight,
  });
  const sourceCanvas = createRenderCanvas(project.width, project.height);
  const assets = new RenderAssetStore(project.assets);
  const renderer = new Canvas2DProjectRenderer(sourceCanvas, assets);

  try {
    throwIfAborted(options.signal);
    await renderer.render(project, clampedTime, options.signal);
    throwIfAborted(options.signal);

    let outputCanvas = sourceCanvas;
    if (dimensions.width !== project.width || dimensions.height !== project.height) {
      outputCanvas = createRenderCanvas(dimensions.width, dimensions.height);
      const context = outputCanvas.getContext('2d');
      if (!context || !('drawImage' in context)) throw new Error('PNG用Canvas 2D contextを作成できません。');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      context.drawImage(sourceCanvas, 0, 0, dimensions.width, dimensions.height);
    }

    const blob = await canvasToPng(outputCanvas);
    throwIfAborted(options.signal);
    return {
      fileName: ensurePngExtension(options.fileName ?? `${project.name || 'frame'}-${formatFrameStamp(clampedTime)}.png`),
      mimeType: 'image/png',
      blob,
      width: dimensions.width,
      height: dimensions.height,
      timeSeconds: clampedTime,
    };
  } finally {
    await assets.close();
  }
}

export function clampStillTime(project: Pick<Project, 'duration'>, timeSeconds: number) {
  const duration = Math.max(0, finite(project.duration, 0));
  return Math.max(0, Math.min(duration, finite(timeSeconds, 0)));
}

export function formatFrameStamp(timeSeconds: number) {
  const milliseconds = Math.max(0, Math.round(finite(timeSeconds, 0) * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor(milliseconds / 60_000) % 60;
  const seconds = Math.floor(milliseconds / 1000) % 60;
  const millis = milliseconds % 1000;
  return `${pad(hours, 2)}-${pad(minutes, 2)}-${pad(seconds, 2)}-${pad(millis, 3)}`;
}

function createRenderCanvas(width: number, height: number): RenderCanvas {
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

function ensurePngExtension(fileName: string) {
  const safe = sanitizeRenderFileName(fileName || 'frame.png').replace(/\.png$/i, '');
  return `${safe || 'frame'}.png`;
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException(typeof signal.reason === 'string' ? signal.reason : 'Operation aborted', 'AbortError');
}

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function pad(value: number, width: number) {
  return String(value).padStart(width, '0');
}
