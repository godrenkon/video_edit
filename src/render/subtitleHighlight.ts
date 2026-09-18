import type { SubtitlePayload } from '../types/editor';

export interface SubtitleHighlightRange {
  wordIndex: number;
  text: string;
  charStart: number;
  charEnd: number;
  start: number;
  end: number;
}

export function activeSubtitleHighlight(
  subtitle: SubtitlePayload | null | undefined,
  clipLocalTime: number,
): SubtitleHighlightRange | null {
  if (!subtitle?.wordHighlight || !subtitle.words?.length) return null;
  const time = Math.max(0, Number.isFinite(clipLocalTime) ? clipLocalTime : 0);
  const ranges = subtitleWordRanges(subtitle);
  return ranges.find((range) => time >= range.start && time < range.end) ?? null;
}

export function subtitleWordRanges(subtitle: SubtitlePayload): SubtitleHighlightRange[] {
  const source = subtitle.text ?? '';
  const words = subtitle.words ?? [];
  const result: SubtitleHighlightRange[] = [];
  let cursor = 0;

  for (let index = 0; index < words.length; index += 1) {
    const word = words[index];
    const text = String(word.text ?? '');
    if (!text) continue;
    const start = Math.max(0, finite(word.start, 0));
    const end = Math.max(start, finite(word.end, start));
    if (end <= start) continue;

    let charStart = source.indexOf(text, cursor);
    if (charStart < 0) charStart = source.indexOf(text);
    if (charStart < 0) continue;
    const charEnd = charStart + text.length;
    result.push({ wordIndex: index, text, charStart, charEnd, start, end });
    cursor = charEnd;
  }

  return result;
}

export function generateEvenSubtitleWords(text: string, duration: number) {
  const source = String(text ?? '');
  const total = Math.max(0.001, finite(duration, 1));
  const tokens = tokenizeSubtitle(source);
  if (!tokens.length) return [];

  const step = total / tokens.length;
  return tokens.map((token, index) => ({
    text: token,
    start: index * step,
    end: index === tokens.length - 1 ? total : (index + 1) * step,
  }));
}

export function normalizeSubtitleHighlightColor(value: string | undefined) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffc928';
}

function tokenizeSubtitle(text: string) {
  if (!text.trim()) return [];
  if (/\s/.test(text.trim())) {
    return text.match(/\S+/gu) ?? [];
  }
  return Array.from(text).filter((character) => !/\s/u.test(character));
}

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}
