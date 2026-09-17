import { defaultSubtitleClip } from './project';
import type { Clip } from '../types/editor';

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface SubtitleClipImportOptions {
  offsetSeconds?: number;
  y?: number;
}

const TIMING_PATTERN = /^\s*(\d{1,3}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,3}):(\d{2}):(\d{2})[,.](\d{1,3})(?:\s+.*)?$/;

export function parseSrt(input: string): SubtitleCue[] {
  const normalized = String(input ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim();
  if (!normalized) return [];

  const cues: SubtitleCue[] = [];
  for (const block of normalized.split(/\n{2,}/)) {
    const lines = block.split('\n');
    const timingIndex = lines.findIndex((line) => TIMING_PATTERN.test(line));
    if (timingIndex < 0) continue;
    const timing = parseTimingLine(lines[timingIndex]);
    if (!timing || timing.end <= timing.start) continue;
    const text = lines.slice(timingIndex + 1).join('\n').trim();
    if (!text) continue;
    cues.push({ ...timing, text });
  }

  return cues.sort((a, b) => a.start - b.start || a.end - b.end);
}

export function formatSrt(cues: SubtitleCue[]) {
  const valid = cues
    .filter((cue) => Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.end > cue.start && cue.text.trim().length > 0)
    .map((cue) => ({
      start: Math.max(0, cue.start),
      end: Math.max(0, cue.end),
      text: cue.text.replace(/\r\n?/g, '\n').trim(),
    }))
    .filter((cue) => cue.end > cue.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  return valid.map((cue, index) => [
    String(index + 1),
    `${formatSrtTimestamp(cue.start)} --> ${formatSrtTimestamp(cue.end)}`,
    cue.text,
  ].join('\n')).join('\n\n') + (valid.length ? '\n' : '');
}

export function subtitleClipsFromSrt(input: string, options: SubtitleClipImportOptions = {}): Clip[] {
  const offset = Math.max(0, finite(options.offsetSeconds, 0));
  const y = finite(options.y, 0);
  return parseSrt(input).map((cue, index) => {
    const start = offset + cue.start;
    const clip = defaultSubtitleClip(start, y, cue.end - cue.start);
    return {
      ...clip,
      name: `字幕 ${index + 1}`,
      subtitle: { text: stripSrtMarkup(cue.text) },
    };
  });
}

export function subtitleClipsToSrt(clips: Clip[]) {
  const cues: SubtitleCue[] = clips
    .filter((clip) => clip.kind === 'subtitle' && Boolean(clip.subtitle?.text?.trim()))
    .map((clip) => ({
      start: Math.max(0, clip.start),
      end: Math.max(0, clip.start + clip.duration),
      text: clip.subtitle?.text ?? '',
    }));
  return formatSrt(cues);
}

export function stripSrtMarkup(text: string) {
  return text
    .replace(/<\/?(?:b|i|u|s)>/gi, '')
    .replace(/<font\b[^>]*>/gi, '')
    .replace(/<\/font>/gi, '')
    .replace(/\{\\[^}]+\}/g, '')
    .trim();
}

export function formatSrtTimestamp(seconds: number) {
  const totalMilliseconds = Math.max(0, Math.round(finite(seconds, 0) * 1000));
  const milliseconds = totalMilliseconds % 1000;
  const totalSeconds = Math.floor(totalMilliseconds / 1000);
  const second = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minute = totalMinutes % 60;
  const hour = Math.floor(totalMinutes / 60);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

function parseTimingLine(line: string) {
  const match = line.match(TIMING_PATTERN);
  if (!match) return null;
  const start = timestampPartsToSeconds(match.slice(1, 5));
  const end = timestampPartsToSeconds(match.slice(5, 9));
  if (start === null || end === null) return null;
  return { start, end };
}

function timestampPartsToSeconds(parts: string[]) {
  const [hoursText, minutesText, secondsText, fractionText] = parts;
  const hours = Number(hoursText);
  const minutes = Number(minutesText);
  const seconds = Number(secondsText);
  const milliseconds = Number(fractionText.padEnd(3, '0').slice(0, 3));
  if (![hours, minutes, seconds, milliseconds].every(Number.isFinite)) return null;
  if (minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function finite(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
