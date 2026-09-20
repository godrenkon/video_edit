import type { Project } from '../types/editor';

export interface ExportDimensions {
  width: number;
  height: number;
}

export interface ExportDimensionOptions {
  outputWidth?: number;
  outputHeight?: number;
}

/**
 * Resolve encoder-safe, even output dimensions without loading the media
 * runtime. Keeping this calculation dependency-free lets the settings UI stay
 * in the lightweight application shell.
 */
export function resolveExportDimensions(
  project: Pick<Project, 'width' | 'height'>,
  options: ExportDimensionOptions = {},
): ExportDimensions {
  const sourceWidth = normalizeDimension(project.width);
  const sourceHeight = normalizeDimension(project.height);
  const requestedWidth = finitePositive(options.outputWidth);
  const requestedHeight = finitePositive(options.outputHeight);

  if (requestedWidth && requestedHeight) {
    return { width: normalizeDimension(requestedWidth), height: normalizeDimension(requestedHeight) };
  }
  if (requestedWidth) {
    return {
      width: normalizeDimension(requestedWidth),
      height: normalizeDimension(requestedWidth * sourceHeight / sourceWidth),
    };
  }
  if (requestedHeight) {
    return {
      width: normalizeDimension(requestedHeight * sourceWidth / sourceHeight),
      height: normalizeDimension(requestedHeight),
    };
  }
  return { width: sourceWidth, height: sourceHeight };
}

function normalizeDimension(value: number) {
  const rounded = Math.round(clamp(value, 16, 8192));
  return rounded % 2 === 0 ? rounded : rounded + (rounded < 8192 ? 1 : -1);
}

function finitePositive(value: number | undefined) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
