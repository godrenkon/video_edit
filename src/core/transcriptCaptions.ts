import type { Clip, Project, TranscriptDocument, TranscriptSegment, Track } from '../types/editor';
import { defaultSubtitleClip, uid } from './project';

export const TRANSCRIPT_SUBTITLE_TRACK_NAME = 'Transcript字幕';

export interface TranscriptSubtitleOptions {
  wordHighlight?: boolean;
  highlightColor?: string;
  y?: number;
}

export interface TranscriptSubtitleResult {
  project: Project;
  trackId?: string;
  clipCount: number;
  reason?: 'no-transcript' | 'locked-track';
}

export function applyTranscriptAsSubtitles(
  project: Project,
  transcript: TranscriptDocument | undefined = project.transcript,
  options: TranscriptSubtitleOptions = {},
): TranscriptSubtitleResult {
  if (!transcript?.segments.length) return { project, clipCount: 0, reason: 'no-transcript' };

  const existing = project.tracks.find(
    (track) => track.kind === 'subtitle' && track.name === TRANSCRIPT_SUBTITLE_TRACK_NAME,
  );
  if (existing?.locked) {
    return { project, trackId: existing.id, clipCount: existing.clips.length, reason: 'locked-track' };
  }

  const trackId = existing?.id ?? uid('track');
  const y = Number.isFinite(options.y)
    ? Number(options.y)
    : project.height * 0.34;
  const clips = transcript.segments
    .map((segment) => transcriptSegmentToSubtitleClip(segment, y, options))
    .filter((clip): clip is Clip => Boolean(clip))
    .sort((a, b) => a.start - b.start || a.duration - b.duration || a.id.localeCompare(b.id));

  const subtitleTrack: Track = existing
    ? { ...existing, clips }
    : {
        id: trackId,
        name: TRANSCRIPT_SUBTITLE_TRACK_NAME,
        kind: 'subtitle',
        muted: false,
        locked: false,
        visible: true,
        clips,
      };

  const tracks = existing
    ? project.tracks.map((track) => track.id === existing.id ? subtitleTrack : track)
    : insertSubtitleTrack(project.tracks, subtitleTrack);
  const maxEnd = clips.reduce((end, clip) => Math.max(end, clip.start + clip.duration), project.duration);

  return {
    project: { ...project, tracks, duration: maxEnd },
    trackId,
    clipCount: clips.length,
  };
}

export function transcriptSegmentToSubtitleClip(
  segment: TranscriptSegment,
  y: number,
  options: TranscriptSubtitleOptions = {},
): Clip | null {
  const text = segment.text.trim();
  const start = finiteNonNegative(segment.start, 0);
  const end = Math.max(start, finiteNonNegative(segment.end, start));
  if (!text || end <= start) return null;

  const clip = defaultSubtitleClip(start, y, Math.max(0.1, end - start));
  const words = normalizeRelativeWords(segment, start, end);
  clip.name = segment.speaker ? `字幕 / ${segment.speaker}` : 'Transcript字幕';
  clip.subtitle = {
    text,
    speaker: cleanOptional(segment.speaker),
    words: words.length ? words : undefined,
    wordHighlight: options.wordHighlight ?? Boolean(words.length),
    highlightColor: normalizeHighlightColor(options.highlightColor),
  };
  return clip;
}

function normalizeRelativeWords(segment: TranscriptSegment, start: number, end: number) {
  const duration = end - start;
  return (segment.words ?? [])
    .map((word) => {
      const wordStart = Math.max(start, Math.min(end, finiteNonNegative(word.start, start)));
      const wordEnd = Math.max(wordStart, Math.min(end, finiteNonNegative(word.end, wordStart)));
      return {
        text: String(word.text ?? '').trim(),
        start: wordStart - start,
        end: wordEnd - start,
      };
    })
    .filter((word) => word.text && word.end > word.start && word.start <= duration)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function insertSubtitleTrack(tracks: Track[], track: Track) {
  const lastSubtitle = tracks.reduce((index, current, currentIndex) => (
    current.kind === 'subtitle' ? currentIndex : index
  ), -1);
  const next = tracks.slice();
  next.splice(lastSubtitle >= 0 ? lastSubtitle + 1 : 0, 0, track);
  return next;
}

function cleanOptional(value: string | undefined) {
  const clean = value?.trim().replace(/\s+/g, ' ').slice(0, 120);
  return clean || undefined;
}

function normalizeHighlightColor(value: string | undefined) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : '#ffd84d';
}

function finiteNonNegative(value: number, fallback: number) {
  return Number.isFinite(value) ? Math.max(0, value) : fallback;
}
