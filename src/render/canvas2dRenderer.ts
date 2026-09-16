import type { BlendMode, Project } from '../types/editor';
import { resolveCropRectangle } from './cropGeometry';
import { canvasFilterForEffects } from './effectEvaluation';
import { buildVisualFramePlan, type VisualFrameLayerPlan } from './framePlan';
import { RenderAssetStore } from './renderAssetStore';
import {
  deterministicNoiseByte,
  generatorColor,
  generatorNumber,
  hashString,
  resolveTextStyle,
  wrapTextLines,
} from './syntheticLayers';

export { resolveCropRectangle } from './cropGeometry';

export type RenderCanvas = HTMLCanvasElement | OffscreenCanvas;
export type RenderContext2D = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

export function blendModeToCanvas(blendMode: BlendMode): GlobalCompositeOperation {
  if (blendMode === 'add') return 'lighter';
  return blendMode === 'normal' ? 'source-over' : blendMode;
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
    resetCanvas(context, project);

    for (const layer of buildVisualFramePlan(project, timeSeconds)) {
      assertNotAborted(signal);
      if (layer.kind === 'text' || layer.kind === 'subtitle') {
        drawTextLayer(context, project, layer);
        continue;
      }
      if (layer.kind === 'generator') {
        drawGeneratorLayer(context, project, layer, timeSeconds);
        continue;
      }
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
        applyLayerTransform(context, project, layer);
        if (frame.kind === 'video') {
          frame.sample.draw(context, crop.x, crop.y, crop.width, crop.height, dx, dy, drawWidth, drawHeight);
        } else {
          context.drawImage(frame.bitmap, crop.x, crop.y, crop.width, crop.height, dx, dy, drawWidth, drawHeight);
        }
        context.restore();
      } finally {
        this.assets.releaseFrame(frame);
      }
    }
  }
}

function resetCanvas(context: RenderContext2D, project: Project) {
  context.save();
  context.resetTransform();
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  context.filter = 'none';
  context.fillStyle = project.background || '#000000';
  context.fillRect(0, 0, project.width, project.height);
  context.restore();
}

function applyLayerTransform(context: RenderContext2D, project: Project, layer: VisualFrameLayerPlan) {
  context.globalAlpha = clamp(layer.transform.opacity, 0, 1);
  context.globalCompositeOperation = blendModeToCanvas(layer.blendMode);
  context.filter = canvasFilterForEffects(layer.effects, layer.clipLocalTime);
  context.translate(project.width / 2 + layer.transform.x, project.height / 2 + layer.transform.y);
  context.rotate(layer.transform.rotation * Math.PI / 180);
  context.scale(layer.transform.scale, layer.transform.scale);
}

function drawTextLayer(context: RenderContext2D, project: Project, layer: VisualFrameLayerPlan) {
  const subtitleText = layer.kind === 'subtitle' ? layer.subtitle?.text : undefined;
  const style = resolveTextStyle(layer.text, subtitleText);
  if (!style.text) return;

  context.save();
  applyLayerTransform(context, project, layer);
  context.font = `${style.fontWeight} ${style.fontSize}px ${quoteFontFamily(style.fontFamily)}`;
  context.textAlign = style.align;
  context.textBaseline = 'middle';
  context.lineJoin = 'round';
  context.lineWidth = style.strokeWidth;

  const maxWidth = project.width * 0.82;
  const lines = wrapTextLines(style.text, maxWidth, (value) => context.measureText(value).width);
  const lineHeight = style.fontSize * 1.2;
  const widths = lines.map((line) => context.measureText(line).width);
  const contentWidth = Math.min(maxWidth, Math.max(1, ...widths));
  const contentHeight = Math.max(lineHeight, lines.length * lineHeight);
  const paddingX = Math.max(12, style.fontSize * 0.3);
  const paddingY = Math.max(8, style.fontSize * 0.18);
  const anchorOffsetX = -contentWidth * (layer.transform.anchorX - 0.5);
  const anchorOffsetY = -contentHeight * (layer.transform.anchorY - 0.5);

  let textX = anchorOffsetX;
  if (style.align === 'left') textX -= contentWidth / 2;
  if (style.align === 'right') textX += contentWidth / 2;

  if (style.backgroundColor) {
    context.fillStyle = style.backgroundColor;
    context.fillRect(
      anchorOffsetX - contentWidth / 2 - paddingX,
      anchorOffsetY - contentHeight / 2 - paddingY,
      contentWidth + paddingX * 2,
      contentHeight + paddingY * 2,
    );
  }

  for (let index = 0; index < lines.length; index += 1) {
    const y = anchorOffsetY + (index - (lines.length - 1) / 2) * lineHeight;
    if (style.strokeColor && style.strokeWidth > 0) {
      context.strokeStyle = style.strokeColor;
      context.strokeText(lines[index], textX, y, maxWidth);
    }
    context.fillStyle = style.color;
    context.fillText(lines[index], textX, y, maxWidth);
  }
  context.restore();
}

function drawGeneratorLayer(
  context: RenderContext2D,
  project: Project,
  layer: VisualFrameLayerPlan,
  timeSeconds: number,
) {
  const payload = layer.generator;
  if (!payload) return;
  const width = project.width;
  const height = project.height;
  const dx = -width * layer.transform.anchorX;
  const dy = -height * layer.transform.anchorY;

  context.save();
  applyLayerTransform(context, project, layer);

  if (payload.kind === 'gradient') {
    const angle = generatorNumber(payload, 'angle', 0, -360, 360) * Math.PI / 180;
    const radius = Math.hypot(width, height) / 2;
    const gradient = context.createLinearGradient(
      Math.cos(angle + Math.PI) * radius,
      Math.sin(angle + Math.PI) * radius,
      Math.cos(angle) * radius,
      Math.sin(angle) * radius,
    );
    gradient.addColorStop(0, generatorColor(payload, 'startColor', '#161b22'));
    gradient.addColorStop(1, generatorColor(payload, 'endColor', '#5fd8ff'));
    context.fillStyle = gradient;
    context.fillRect(dx, dy, width, height);
  } else if (payload.kind === 'bars') {
    const colors = ['#ffffff', '#ffff00', '#00ffff', '#00ff00', '#ff00ff', '#ff0000', '#0000ff'];
    const barWidth = width / colors.length;
    colors.forEach((color, index) => {
      context.fillStyle = color;
      context.fillRect(dx + index * barWidth, dy, barWidth + 1, height * 0.72);
    });
    context.fillStyle = '#111111';
    context.fillRect(dx, dy + height * 0.72, width, height * 0.28);
  } else if (payload.kind === 'noise') {
    const columns = 32;
    const rows = 18;
    const cellWidth = width / columns;
    const cellHeight = height / rows;
    const speed = generatorNumber(payload, 'speed', 8, 0, 120);
    const seed = hashString(`${layer.clipId}:${Math.floor(timeSeconds * speed)}`);
    for (let y = 0; y < rows; y += 1) {
      for (let x = 0; x < columns; x += 1) {
        const value = deterministicNoiseByte(seed, x, y);
        context.fillStyle = `rgb(${value},${value},${value})`;
        context.fillRect(dx + x * cellWidth, dy + y * cellHeight, cellWidth + 1, cellHeight + 1);
      }
    }
  } else {
    context.fillStyle = generatorColor(payload, 'color', '#202830');
    context.fillRect(dx, dy, width, height);
  }

  context.restore();
}

function quoteFontFamily(fontFamily: string) {
  if (/^[\w -]+$/.test(fontFamily)) return `"${fontFamily.replace(/"/g, '')}"`;
  return 'sans-serif';
}

function assertNotAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  if (reason instanceof Error) throw reason;
  throw new DOMException(typeof reason === 'string' ? reason : 'Operation aborted', 'AbortError');
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
