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

const SRT_TIMING_PATTERN = /^\s*(\d{1,3}):(\d{2}):(\d{2})[,.](\d{1,3})\s*-->\s*(\d{1,3}):(\d{2}):(\d{2})[,.](\d{1,3})(?:\s+.*)?$/;
const VTT_TIMING_PATTERN = /^\s*(\S+)\s+-->\s+(\S+)(?:\s+.*)?$/;

export function parseSrt(input: string): SubtitleCue[] {
  const normalized = normalizeSubtitleText(input).trim();
  if (!normalized) return [];

  const cues: SubtitleCue[] = [];
  for (const block of normalized.split(/\n{2,}/)) {
    const lines = block.split('\n');
    const timingIndex = lines.findIndex((line) => SRT_TIMING_PATTERN.test(line));
    if (timingIndex < 0) continue;
    const timing = parseSrtTimingLine(lines[timingIndex]);
    if (!timing || timing.end <= timing.start) continue;
    const text = lines.slice(timingIndex + 1).join('\n').trim();
    if (!text) continue;
    cues.push({ ...timing, text });
  }

  return sortCues(cues);
}

export function parseWebVtt(input: string): SubtitleCue[] {
  let normalized = normalizeSubtitleText(input).trim();
  if (!normalized) return [];
  if (/^WEBVTT(?:\s.*)?(?:\n|$)/i.test(normalized)) {
    normalized = normalized.replace(/^WEBVTT(?:\s.*)?(?:\n|$)/i, '').trim();
  }
  if (!normalized) return [];

  const cues: SubtitleCue[] = [];
  for (const block of normalized.split(/\n{2,}/)) {
    const lines = block.split('\n');
    const first = lines[0]?.trim().toUpperCase() ?? '';
    if (first.startsWith('NOTE') || first === 'STYLE' || first === 'REGION') continue;
    const timingIndex = lines.findIndex((line) => VTT_TIMING_PATTERN.test(line));
    if (timingIndex < 0) continue;
    const timing = parseVttTimingLine(lines[timingIndex]);
    if (!timing || timing.end <= timing.start) continue;
    const text = lines.slice(timingIndex + 1).join('\n').trim();
    if (!text) continue;
    cues.push({ ...timing, text });
  }

  return sortCues(cues);
}

export function formatSrt(cues: SubtitleCue[]) {
  const valid = validCues(cues);
  return valid.map((cue, index) => [
    String(index + 1),
    `${formatSrtTimestamp(cue.start)} --> ${formatSrtTimestamp(cue.end)}`,
    cue.text,
  ].join('\n')).join('\n\n') + (valid.length ? '\n' : '');
}

export function formatWebVtt(cues: SubtitleCue[]) {
  const valid = validCues(cues);
  const body = valid.map((cue) => [
    `${formatVttTimestamp(cue.start)} --> ${formatVttTimestamp(cue.end)}`,
    cue.text,
  ].join('\n')).join('\n\n');
  return `WEBVTT\n\n${body}${valid.length ? '\n' : ''}`;
}

export function subtitleClipsFromSrt(input: string, options: SubtitleClipImportOptions = {}): Clip[] {
  return clipsFromCues(parseSrt(input), options);
}

export function subtitleClipsFromWebVtt(input: string, options: SubtitleClipImportOptions = {}): Clip[] {
  return clipsFromCues(parseWebVtt(input), options);
}

export function subtitleClipsToSrt(clips: Clip[]) {
  return formatSrt(cuesFromClips(clips));
}

export function subtitleClipsToWebVtt(clips: Clip[]) {
  return formatWebVtt(cuesFromClips(clips));
}

export function stripSrtMarkup(text: string) {
  return text
    .replace(/<\/?(?:b|i|u|s)>/gi, '')
    .replace(/<font\b[^>]*>/gi, '')
    .replace(/<\/font>/gi, '')
    .replace(/\{\\[^}]+\}/g, '')
    .trim();
}

export function stripSubtitleMarkup(text: string) {
  return stripSrtMarkup(text)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&amp;/gi, '&')
    .trim();
}

export function formatSrtTimestamp(seconds: number) {
  return formatTimestamp(seconds, ',');
}

export function formatVttTimestamp(seconds: number) {
  return formatTimestamp(seconds, '.');
}

function clipsFromCues(cues: SubtitleCue[], options: SubtitleClipImportOptions) {
  const offset = Math.max(0, finite(options.offsetSeconds, 0));
  const y = finite(options.y, 0);
  return cues.map((cue, index) => {
    const start = offset + cue.start;
    const clip = defaultSubtitleClip(start, y, cue.end - cue.start);
    return {
      ...clip,
      name: `字幕 ${index + 1}`,
      subtitle: { text: stripSubtitleMarkup(cue.text) },
    };
  });
}

function cuesFromClips(clips: Clip[]): SubtitleCue[] {
  return clips
    .filter((clip) => clip.kind === 'subtitle' && Boolean(clip.subtitle?.text?.trim()))
    .map((clip) => ({
      start: Math.max(0, clip.start),
      end: Math.max(0, clip.start + clip.duration),
      text: clip.subtitle?.text ?? '',
    }));
}

function validCues(cues: SubtitleCue[]) {
  return cues
    .filter((cue) => Number.isFinite(cue.start) && Number.isFinite(cue.end) && cue.end > cue.start && cue.text.trim().length > 0)
    .map((cue) => ({
      start: Math.max(0, cue.start),
      end: Math.max(0, cue.end),
      text: cue.text.replace(/\r\n?/g, '\n').trim(),
    }))
    .filter((cue) => cue.end > cue.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function sortCues(cues: SubtitleCue[]) {
  return cues.sort((a, b) => a.start - b.start || a.end - b.end);
}

function parseSrtTimingLine(line: string) {
  const match = line.match(SRT_TIMING_PATTERN);
  if (!match) return null;
  const start = timestampPartsToSeconds(match.slice(1, 5));
  const end = timestampPartsToSeconds(match.slice(5, 9));
  if (start === null || end === null) return null;
  return { start, end };
}

function parseVttTimingLine(line: string) {
  const match = line.match(VTT_TIMING_PATTERN);
  if (!match) return null;
  const start = parseVttTimestamp(match[1]);
  const end = parseVttTimestamp(match[2]);
  if (start === null || end === null) return null;
  return { start, end };
}

function parseVttTimestamp(value: string) {
  const parts = value.split(':');
  if (parts.length !== 2 && parts.length !== 3) return null;
  const secondsPart = parts.at(-1)?.match(/^(\d{2})\.(\d{1,3})$/);
  if (!secondsPart) return null;
  const seconds = Number(secondsPart[1]);
  const milliseconds = Number(secondsPart[2].padEnd(3, '0').slice(0, 3));
  const minutes = Number(parts.at(-2));
  const hours = parts.length === 3 ? Number(parts[0]) : 0;
  if (![hours, minutes, seconds, milliseconds].every(Number.isFinite)) return null;
  if (minutes > 59 || seconds > 59 || hours < 0 || minutes < 0 || seconds < 0) return null;
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
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

function formatTimestamp(seconds: number, fractionSeparator: ',' | '.') {
  const totalMilliseconds = Math.max(0, Math.round(finite(seconds, 0) * 1000));
  const milliseconds = totalMilliseconds % 1000;
  const totalSeconds = Math.floor(totalMilliseconds / 1000);
  const second = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minute = totalMinutes % 60;
  const hour = Math.floor(totalMinutes / 60);
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}${fractionSeparator}${String(milliseconds).padStart(3, '0')}`;
}

function normalizeSubtitleText(input: string) {
  return String(input ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function finite(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
