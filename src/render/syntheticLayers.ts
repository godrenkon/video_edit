import type { GeneratorPayload, TextPayload } from '../types/editor';

export interface TextRenderStyle {
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  color: string;
  strokeColor: string | null;
  strokeWidth: number;
  backgroundColor: string | null;
  align: 'left' | 'center' | 'right';
}

export function resolveTextStyle(text: TextPayload | null, subtitleText?: string): TextRenderStyle {
  const source = text ?? {} as TextPayload;
  return {
    text: source.text ?? subtitleText ?? '',
    fontFamily: source.fontFamily?.trim() || 'sans-serif',
    fontSize: finite(source.fontSize, subtitleText ? 54 : 64, 8, 600),
    fontWeight: finite(source.fontWeight, 700, 100, 1000),
    color: source.color || '#ffffff',
    strokeColor: source.strokeColor ?? (subtitleText ? '#000000' : null),
    strokeWidth: finite(source.strokeWidth, subtitleText ? 5 : 0, 0, 40),
    backgroundColor: source.backgroundColor ?? (subtitleText ? 'rgba(0,0,0,0.55)' : null),
    align: source.align ?? 'center',
  };
}

export function wrapTextLines(
  text: string,
  maxWidth: number,
  measure: (value: string) => number,
): string[] {
  const paragraphs = text.replace(/\r\n?/g, '\n').split('\n');
  const result: string[] = [];
  const width = Math.max(1, maxWidth);

  for (const paragraph of paragraphs) {
    if (!paragraph) {
      result.push('');
      continue;
    }

    let line = '';
    const tokens = /\s/.test(paragraph) ? paragraph.split(/(\s+)/).filter(Boolean) : [...paragraph];
    for (const token of tokens) {
      const candidate = line + token;
      if (line && measure(candidate) > width) {
        result.push(line.trimEnd());
        line = token.trimStart();
      } else {
        line = candidate;
      }
    }
    if (line || result.length === 0) result.push(line.trimEnd());
  }

  return result.length ? result : [''];
}

export function generatorColor(payload: GeneratorPayload | null, key: string, fallback: string) {
  const value = payload?.data?.[key];
  return typeof value === 'string' && value.trim() ? value : fallback;
}

export function generatorNumber(payload: GeneratorPayload | null, key: string, fallback: number, min: number, max: number) {
  const value = payload?.data?.[key];
  return finite(typeof value === 'number' ? value : Number.NaN, fallback, min, max);
}

export function deterministicNoiseByte(seed: number, x: number, y: number) {
  let value = (seed ^ Math.imul(x + 1, 0x45d9f3b) ^ Math.imul(y + 1, 0x119de1f3)) | 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x45d9f3b);
  value ^= value >>> 16;
  return value & 0xff;
}

export function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function finite(value: number | undefined, fallback: number, min: number, max: number) {
  const number = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.min(max, Math.max(min, number));
}
