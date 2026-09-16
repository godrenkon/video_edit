import type { BlendMode, Crop, Project } from '../types/editor';
import { buildVisualFramePlan } from './framePlan';
import { RenderAssetStore } from './renderAssetStore';

export type RenderCanvas = HTMLCanvasElement | OffscreenCanvas;
export type RenderContext2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function blendModeToCanvas(blendMode: BlendMode): GlobalCompositeOperation {
  if (blendMode === 'add') return 'lighter';
  return blendMode === 'normal' ? 'source-over' : blendMode;
}

export function resolveCropRectangle(width: number, height: number, crop: Crop | null) {
  if (!crop) return { x: 0, y: 0, width, height };
  const normalized = [crop.top, crop.right, crop.bottom, crop.left].every((value) => value >= 0 && value <= 1);
  const factorX = normalized ? width : 1;
  const factorY = normalized ? height : 1;
  const top = clamp(crop.top, 0, normalized ? 1 : height) * factorY;
  const right = clamp(crop.right, 0, normalized ? 1 : width) * factorX;
  const bottom = clamp(crop.bottom, 0, normalized ? 1 : height) * factorY;
  const left = clamp(crop.left, 0, normalized ? 1 : width) * factorX;
  return { x: left, y: top, width: Math.max(0, width - left - right), height: Math.max(0, height - top - bottom) };
}

export class Canvas2DProjectRenderer {
  readonly canvas: RenderCanvas;
  readonly assets: RenderAssetStore;
  private readonly context: RenderContext2D;

  constructor(canvas: RenderCanvas, assets: RenderAssetStore) {
    const context = canvas.getContext('2d');
    if (!context || !('drawImage' in context)) throw new Error('2D canvas rendering is not available');
    this.canvas = canvas;
    this.assets = assets;
    this.context = context as RenderContext2D;
  }

  async render(project: Project, timeSeconds: number, signal?: AbortSignal) {
    if (this.canvas.width !== project.width) this.canvas.width = project.width;
    if (this.canvas.height !== project.height) this.canvas.height = project.height;
    const context = this.context;
    context.save();
    context.resetTransform();
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
    context.fillStyle = project.background || '#000000';
    context.fillRect(0, 0, project.width, project.height);
    context.restore();

    for (const layer of buildVisualFramePlan(project, timeSeconds)) {
      if (signal?.aborted) throw new DOMException('Operation aborted', 'AbortError');
      if (!layer.assetId) continue;
      const frame = await this.assets.getFrame(layer.assetId, layer.sourceTime, signal);
      if (!frame) continue;
      try {
        const crop = resolveCropRectangle(frame.width, frame.height, layer.crop);
        if (crop.width <= 0 || crop.height <= 0) continue;
        const fit = Math.min(project.width / crop.width, project.height / crop.height);
        const drawWidth = crop.width * fit;
        const drawHeight = crop.height * fit;
        const dx = -drawWidth * layer.transform.anchorX;
        const dy = -drawHeight * layer.transform.anchorY;
        context.save();
        context.globalAlpha = clamp(layer.transform.opacity, 0, 1);
        context.globalCompositeOperation = blendModeToCanvas(layer.blendMode);
        context.translate(project.width / 2 + layer.transform.x, project.height / 2 + layer.transform.y);
        context.rotate(layer.transform.rotation * Math.PI / 180);
        context.scale(layer.transform.scale, layer.transform.scale);
        if (frame.kind === 'video') frame.sample.draw(context, crop.x, crop.y, crop.width, crop.height, dx, dy, drawWidth, drawHeight);
        else context.drawImage(frame.bitmap, crop.x, crop.y, crop.width, crop.height, dx, dy, drawWidth, drawHeight);
        context.restore();
      } finally {
        this.assets.releaseFrame(frame);
      }
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
