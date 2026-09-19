import type { BlendMode, Project } from '../types/editor';
import { resolveCropRectangle } from './cropGeometry';
import { canvasFilterForEffects, resolveTemperatureTintEffects, resolveVignetteEffects, type ResolvedColorWash, type ResolvedVignette } from './effectEvaluation';
import { buildVisualFramePlan, type VisualFrameLayerPlan } from './framePlan';
import { activeSubtitleHighlight, normalizeSubtitleHighlightColor, type SubtitleHighlightRange } from './subtitleHighlight';
import { RenderAssetStore, type RenderAssetFrame } from './renderAssetStore';
import { applyPixelEffects, hasPixelEffects } from './pixelEffects';
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
  private readonly pixelCanvas: RenderCanvas;
  private readonly pixelContext: RenderContext2D;

  constructor(canvas: RenderCanvas, assets: RenderAssetStore) {
    const context = canvas.getContext('2d');
    if (!context || !('drawImage' in context)) throw new Error('2D canvas rendering is not available');
    this.canvas = canvas;
    this.assets = assets;
    this.context = context as RenderContext2D;
    this.pixelCanvas = createScratchCanvas(1, 1);
    const pixelContext = this.pixelCanvas.getContext('2d');
    if (!pixelContext || !('drawImage' in pixelContext)) throw new Error('Pixel effect canvas is unavailable');
    this.pixelContext = pixelContext as RenderContext2D;
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
        applyLayerReveal(context, layer, dx, dy, drawWidth, drawHeight);
        if (hasPixelEffects(layer.effects)) {
          drawPixelProcessedFrame(
            context,
            this.pixelCanvas,
            this.pixelContext,
            frame,
            crop,
            dx,
            dy,
            drawWidth,
            drawHeight,
            layer.effects,
            layer.clipLocalTime,
          );
        } else if (frame.kind === 'video') {
          frame.sample.draw(context, crop.x, crop.y, crop.width, crop.height, dx, dy, drawWidth, drawHeight);
        } else {
          context.drawImage(frame.bitmap, crop.x, crop.y, crop.width, crop.height, dx, dy, drawWidth, drawHeight);
        }
        drawVisualOverlayEffects(context, layer.effects, layer.clipLocalTime, dx, dy, drawWidth, drawHeight);
        context.restore();
      } finally {
        this.assets.releaseFrame(frame);
      }
    }
  }
}

function drawPixelProcessedFrame(
  context: RenderContext2D,
  scratch: RenderCanvas,
  scratchContext: RenderContext2D,
  frame: RenderAssetFrame,
  crop: ReturnType<typeof resolveCropRectangle>,
  dx: number,
  dy: number,
  drawWidth: number,
  drawHeight: number,
  effects: VisualFrameLayerPlan['effects'],
  clipLocalTime: number,
) {
  const width = Math.max(1, Math.round(crop.width));
  const height = Math.max(1, Math.round(crop.height));
  if (scratch.width !== width) scratch.width = width;
  if (scratch.height !== height) scratch.height = height;

  scratchContext.save();
  scratchContext.resetTransform();
  scratchContext.globalAlpha = 1;
  scratchContext.globalCompositeOperation = 'source-over';
  scratchContext.filter = 'none';
  scratchContext.clearRect(0, 0, width, height);
  if (frame.kind === 'video') {
    frame.sample.draw(scratchContext, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  } else {
    scratchContext.drawImage(frame.bitmap, crop.x, crop.y, crop.width, crop.height, 0, 0, width, height);
  }
  const image = scratchContext.getImageData(0, 0, width, height);
  applyPixelEffects(image, effects, clipLocalTime);
  scratchContext.putImageData(image, 0, 0);
  scratchContext.restore();

  context.drawImage(scratch as CanvasImageSource, 0, 0, width, height, dx, dy, drawWidth, drawHeight);
}

function createScratchCanvas(width: number, height: number): RenderCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document === 'undefined') throw new Error('Canvas is unavailable');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
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

function applyLayerReveal(
  context: RenderContext2D,
  layer: VisualFrameLayerPlan,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const reveal = layer.reveal;
  if (reveal.x <= 0 && reveal.y <= 0 && reveal.width >= 1 && reveal.height >= 1) return;
  context.beginPath();
  context.rect(
    x + width * reveal.x,
    y + height * reveal.y,
    width * reveal.width,
    height * reveal.height,
  );
  context.clip();
}

function drawTextLayer(context: RenderContext2D, project: Project, layer: VisualFrameLayerPlan) {
  const subtitleText = layer.kind === 'subtitle' ? layer.subtitle?.text : undefined;
  const style = resolveTextStyle(layer.text, subtitleText);
  if (!style.text) return;

  context.save();
  applyLayerTransform(context, project, layer);
  applyLayerReveal(
    context,
    layer,
    -project.width * layer.transform.anchorX,
    -project.height * layer.transform.anchorY,
    project.width,
    project.height,
  );
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
      context.shadowColor = 'rgba(0,0,0,0)';
      context.shadowBlur = 0;
      context.shadowOffsetX = 0;
      context.shadowOffsetY = 0;
      context.strokeStyle = style.strokeColor;
      context.strokeText(lines[index], textX, y, maxWidth);
    }
    context.shadowColor = style.shadowColor ?? 'rgba(0,0,0,0)';
    context.shadowBlur = style.shadowBlur;
    context.shadowOffsetX = style.shadowOffsetX;
    context.shadowOffsetY = style.shadowOffsetY;
    context.fillStyle = style.color;
    context.fillText(lines[index], textX, y, maxWidth);
  }

  if (layer.kind === 'subtitle' && subtitleText === style.text) {
    const highlight = activeSubtitleHighlight(layer.subtitle, layer.clipLocalTime);
    if (highlight) {
      drawSubtitleHighlightWord(
        context,
        subtitleText ?? '',
        lines,
        widths,
        textX,
        anchorOffsetY,
        lineHeight,
        style,
        highlight,
        normalizeSubtitleHighlightColor(layer.subtitle?.highlightColor),
      );
    }
  }
  drawVisualOverlayEffects(
    context,
    layer.effects,
    layer.clipLocalTime,
    -project.width * layer.transform.anchorX,
    -project.height * layer.transform.anchorY,
    project.width,
    project.height,
  );
  context.restore();
}

function drawSubtitleHighlightWord(
  context: RenderContext2D,
  sourceText: string,
  lines: string[],
  widths: number[],
  textX: number,
  anchorOffsetY: number,
  lineHeight: number,
  style: ReturnType<typeof resolveTextStyle>,
  highlight: SubtitleHighlightRange,
  highlightColor: string,
) {
  let searchCursor = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line) continue;
    const lineStart = sourceText.indexOf(line, searchCursor);
    if (lineStart < 0) continue;
    const lineEnd = lineStart + line.length;
    searchCursor = lineEnd;
    if (highlight.charStart < lineStart || highlight.charEnd > lineEnd) continue;

    const localStart = highlight.charStart - lineStart;
    const activeText = sourceText.slice(highlight.charStart, highlight.charEnd);
    const prefix = line.slice(0, localStart);
    const lineWidth = widths[index] ?? context.measureText(line).width;
    let lineLeft = textX;
    if (style.align === 'center') lineLeft = textX - lineWidth / 2;
    else if (style.align === 'right') lineLeft = textX - lineWidth;

    const x = lineLeft + context.measureText(prefix).width;
    const y = anchorOffsetY + (index - (lines.length - 1) / 2) * lineHeight;
    const previousAlign = context.textAlign;
    context.textAlign = 'left';

    if (style.strokeColor && style.strokeWidth > 0) {
      context.shadowColor = 'rgba(0,0,0,0)';
      context.shadowBlur = 0;
      context.shadowOffsetX = 0;
      context.shadowOffsetY = 0;
      context.strokeStyle = style.strokeColor;
      context.strokeText(activeText, x, y);
    }

    context.shadowColor = style.shadowColor ?? 'rgba(0,0,0,0)';
    context.shadowBlur = style.shadowBlur;
    context.shadowOffsetX = style.shadowOffsetX;
    context.shadowOffsetY = style.shadowOffsetY;
    context.fillStyle = highlightColor;
    context.fillText(activeText, x, y);
    context.textAlign = previousAlign;
    return;
  }
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
  applyLayerReveal(context, layer, dx, dy, width, height);

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

  drawVisualOverlayEffects(context, layer.effects, layer.clipLocalTime, dx, dy, width, height);
  context.restore();
}

function drawVisualOverlayEffects(
  context: RenderContext2D,
  effects: VisualFrameLayerPlan['effects'],
  clipLocalTime: number,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  if (width <= 0 || height <= 0) return;
  const washes = resolveTemperatureTintEffects(effects, clipLocalTime);
  for (const wash of washes) drawColorWash(context, wash, x, y, width, height);
  const vignettes = resolveVignetteEffects(effects, clipLocalTime);
  for (const vignette of vignettes) drawVignette(context, vignette, x, y, width, height);
}

function drawColorWash(
  context: RenderContext2D,
  wash: ResolvedColorWash,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();
  context.globalCompositeOperation = wash.blendMode;
  context.globalAlpha *= wash.alpha;
  context.fillStyle = wash.color;
  context.fillRect(x, y, width, height);
  context.restore();
}

function drawVignette(
  context: RenderContext2D,
  vignette: ResolvedVignette,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  context.save();
  context.beginPath();
  context.rect(x, y, width, height);
  context.clip();

  const centerX = x + width / 2;
  const centerY = y + height / 2;
  context.translate(centerX, centerY);
  context.scale(Math.max(1e-6, width), Math.max(1e-6, height));
  const gradient = context.createRadialGradient(0, 0, 0, 0, 0, 0.5);
  const edge = vignette.color === 'black' ? '0,0,0' : '255,255,255';
  gradient.addColorStop(vignette.start, `rgba(${edge},0)`);
  gradient.addColorStop(vignette.end, `rgba(${edge},${vignette.alpha})`);
  context.fillStyle = gradient;
  context.fillRect(-0.5, -0.5, 1, 1);
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
