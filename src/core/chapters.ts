import type { TimelineMarker, TranscriptDocument, TranscriptSegment } from '../types/editor';

export interface ChapterGenerationOptions {
  minChapterDuration?: number;
  maxChapterDuration?: number;
  gapThreshold?: number;
  maxChapters?: number;
}

export interface ChapterCandidate {
  time: number;
  title: string;
  sourceSegmentId: string;
}

export const AUTO_CHAPTER_NOTE = 'auto-chapter:transcript';

export function buildTranscriptChapterCandidates(
  transcript: TranscriptDocument | undefined,
  options: ChapterGenerationOptions = {},
): ChapterCandidate[] {
  if (!transcript?.segments.length) return [];

  const minDuration = clampFinite(options.minChapterDuration, 10, 600, 30);
  const maxDuration = Math.max(minDuration, clampFinite(options.maxChapterDuration, minDuration, 1800, 150));
  const gapThreshold = clampFinite(options.gapThreshold, 0.5, 120, 4);
  const maxChapters = Math.round(clampFinite(options.maxChapters, 1, 100, 50));
  const segments = [...transcript.segments]
    .filter((segment) => segment.text.trim() && Number.isFinite(segment.start) && Number.isFinite(segment.end) && segment.end > segment.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  if (!segments.length) return [];

  const chapters: ChapterCandidate[] = [{
    time: 0,
    title: chapterTitle(segments[0]),
    sourceSegmentId: segments[0].id,
  }];
  let lastChapterTime = 0;

  for (let index = 1; index < segments.length && chapters.length < maxChapters; index += 1) {
    const segment = segments[index];
    const previous = segments[index - 1];
    const elapsed = segment.start - lastChapterTime;
    const gap = Math.max(0, segment.start - previous.end);
    const naturalBreak = gap >= gapThreshold && elapsed >= minDuration;
    const forcedBreak = elapsed >= maxDuration;
    if (!naturalBreak && !forcedBreak) continue;

    chapters.push({
      time: Math.max(0, segment.start),
      title: chapterTitle(segment),
      sourceSegmentId: segment.id,
    });
    lastChapterTime = segment.start;
  }

  return chapters;
}

export function mergeAutoChapterMarkers(
  markers: TimelineMarker[] | undefined,
  chapters: ChapterCandidate[],
): TimelineMarker[] {
  const manual = (markers ?? []).filter((marker) => marker.note !== AUTO_CHAPTER_NOTE);
  const generated = chapters.map((chapter, index): TimelineMarker => ({
    id: `auto_chapter_${index}_${chapter.sourceSegmentId}`,
    time: chapter.time,
    name: chapter.title,
    color: '#8b5cf6',
    note: AUTO_CHAPTER_NOTE,
  }));
  return [...manual, ...generated].sort((a, b) => a.time - b.time || a.name.localeCompare(b.name, 'ja'));
}

export function youtubeChapterText(chapters: ChapterCandidate[]) {
  return chapters
    .map((chapter) => `${formatYoutubeTime(chapter.time)} ${chapter.title}`)
    .join('\n');
}

function chapterTitle(segment: TranscriptSegment) {
  const clean = segment.text.replace(/\s+/g, ' ').trim();
  const compact = clean.length > 36 ? `${clean.slice(0, 35).trimEnd()}…` : clean;
  return segment.speaker ? `${segment.speaker}: ${compact}` : compact;
}

function formatYoutubeTime(time: number) {
  const seconds = Math.max(0, Math.floor(Number.isFinite(time) ? time : 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
  return `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function clampFinite(value: number | undefined, min: number, max: number, fallback: number) {
  const safe = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, safe));
}
