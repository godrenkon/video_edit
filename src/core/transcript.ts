import { uid } from './project';
import type { Project, TranscriptDocument, TranscriptSegment, TranscriptWord } from '../types/editor';

export interface TranscriptSearchHit {
  segmentId: string;
  start: number;
  end: number;
  text: string;
  speaker?: string;
  score: number;
}

export function buildTranscriptFromSubtitleTracks(
  project: Pick<Project, 'tracks'>,
  now = new Date(),
): TranscriptDocument {
  const segments: TranscriptSegment[] = [];

  for (const track of project.tracks) {
    if (track.kind !== 'subtitle') continue;
    for (const clip of track.clips) {
      if (clip.kind !== 'subtitle') continue;
      const text = clip.subtitle?.text?.trim();
      if (!text) continue;
      const start = Math.max(0, finite(clip.start, 0));
      const end = Math.max(start, start + Math.max(0, finite(clip.duration, 0)));
      if (end <= start) continue;

      const words = normalizeAbsoluteWords(
        clip.subtitle?.words?.map((word) => ({
          text: word.text,
          start: start + finite(word.start, 0),
          end: start + finite(word.end, 0),
        })) ?? [],
        start,
        end,
      );

      segments.push({
        id: `transcript_${clip.id}`,
        start,
        end,
        text,
        speaker: cleanOptionalText(clip.subtitle?.speaker, 120),
        sourceClipId: clip.id,
        words: words.length ? words : undefined,
      });
    }
  }

  segments.sort((a, b) => a.start - b.start || a.end - b.end || a.id.localeCompare(b.id));
  return {
    id: uid('transcript'),
    source: 'subtitle',
    updatedAt: now.toISOString(),
    segments,
  };
}

export function searchTranscript(
  transcript: TranscriptDocument | undefined,
  query: string,
  limit = 100,
): TranscriptSearchHit[] {
  if (!transcript) return [];
  const tokens = tokenize(query);
  if (!tokens.length) return [];

  const hits: TranscriptSearchHit[] = [];
  for (const segment of transcript.segments) {
    const normalizedText = normalize(segment.text);
    const normalizedSpeaker = normalize(segment.speaker ?? '');
    const normalizedWords = (segment.words ?? []).map((word) => normalize(word.text));
    let score = 0;

    for (const token of tokens) {
      let tokenScore = 0;
      if (normalizedText === token) tokenScore = 120;
      else if (normalizedText.startsWith(token)) tokenScore = 90;
      else if (normalizedText.includes(token)) tokenScore = 70;

      if (normalizedSpeaker === token) tokenScore = Math.max(tokenScore, 85);
      else if (normalizedSpeaker.startsWith(token)) tokenScore = Math.max(tokenScore, 60);
      else if (normalizedSpeaker.includes(token)) tokenScore = Math.max(tokenScore, 40);

      for (const word of normalizedWords) {
        if (word === token) tokenScore = Math.max(tokenScore, 75);
        else if (word.includes(token)) tokenScore = Math.max(tokenScore, 45);
      }

      if (!tokenScore) {
        score = 0;
        break;
      }
      score += tokenScore;
    }

    if (!score) continue;
    hits.push({
      segmentId: segment.id,
      start: segment.start,
      end: segment.end,
      text: segment.text,
      speaker: segment.speaker,
      score,
    });
  }

  return hits
    .sort((a, b) => b.score - a.score || a.start - b.start)
    .slice(0, Math.max(1, Math.min(500, Math.round(limit))));
}

export function updateTranscriptSegment(
  transcript: TranscriptDocument,
  segmentId: string,
  patch: Partial<Pick<TranscriptSegment, 'text' | 'speaker' | 'start' | 'end'>>,
  now = new Date(),
): TranscriptDocument {
  let changed = false;
  const segments = transcript.segments.map((segment) => {
    if (segment.id !== segmentId) return segment;
    const start = patch.start === undefined ? segment.start : Math.max(0, finite(patch.start, segment.start));
    const endInput = patch.end === undefined ? segment.end : finite(patch.end, segment.end);
    const end = Math.max(start + 0.001, endInput);
    const text = patch.text === undefined ? segment.text : patch.text.trim().slice(0, 20_000);
    const speaker = patch.speaker === undefined ? segment.speaker : cleanOptionalText(patch.speaker, 120);
    changed = true;
    return {
      ...segment,
      start,
      end,
      text,
      speaker,
      words: segment.words ? normalizeAbsoluteWords(segment.words, start, end) : undefined,
    };
  });
  return changed ? { ...transcript, updatedAt: now.toISOString(), segments } : transcript;
}

export function removeTranscriptSegment(
  transcript: TranscriptDocument,
  segmentId: string,
  now = new Date(),
): TranscriptDocument {
  const segments = transcript.segments.filter((segment) => segment.id !== segmentId);
  return segments.length === transcript.segments.length
    ? transcript
    : { ...transcript, updatedAt: now.toISOString(), segments };
}

export function transcriptPlainText(transcript: TranscriptDocument | undefined) {
  if (!transcript) return '';
  return transcript.segments
    .map((segment) => segment.speaker ? `${segment.speaker}: ${segment.text}` : segment.text)
    .join('\n');
}

export function sanitizeTranscriptDocument(value: unknown): TranscriptDocument | undefined {
  if (!isRecord(value) || !Array.isArray(value.segments)) return undefined;
  const source = value.source === 'voicevox' || value.source === 'stt' || value.source === 'manual'
    ? value.source
    : 'subtitle';
  const segments: TranscriptSegment[] = [];

  for (let index = 0; index < value.segments.length; index += 1) {
    const raw = value.segments[index];
    if (!isRecord(raw)) continue;
    const text = typeof raw.text === 'string' ? raw.text.trim().slice(0, 20_000) : '';
    const start = Math.max(0, finite(raw.start, 0));
    const end = Math.max(start, finite(raw.end, start));
    if (!text || end <= start) continue;

    const words = Array.isArray(raw.words)
      ? normalizeAbsoluteWords(raw.words.filter(isRecord).map((word) => ({
          text: typeof word.text === 'string' ? word.text : '',
          start: finite(word.start, start),
          end: finite(word.end, start),
          confidence: optionalConfidence(word.confidence),
        })), start, end)
      : [];

    segments.push({
      id: typeof raw.id === 'string' && raw.id ? raw.id : `transcript_segment_${index}`,
      start,
      end,
      text,
      speaker: cleanOptionalText(raw.speaker, 120),
      sourceClipId: cleanOptionalText(raw.sourceClipId, 240),
      words: words.length ? words : undefined,
    });
  }

  segments.sort((a, b) => a.start - b.start || a.end - b.end);
  return {
    id: typeof value.id === 'string' && value.id ? value.id : 'transcript_migrated',
    source,
    language: cleanOptionalText(value.language, 40),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
    segments,
  };
}

function normalizeAbsoluteWords(words: TranscriptWord[], segmentStart: number, segmentEnd: number) {
  return words
    .map((word) => {
      const text = String(word.text ?? '').trim().slice(0, 1000);
      const start = clamp(finite(word.start, segmentStart), segmentStart, segmentEnd);
      const end = clamp(finite(word.end, start), start, segmentEnd);
      return {
        text,
        start,
        end,
        confidence: optionalConfidence(word.confidence),
      };
    })
    .filter((word) => word.text && word.end > word.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function tokenize(value: string) {
  return normalize(value).split(/\s+/).filter(Boolean).slice(0, 12);
}

function normalize(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('ja');
}

function cleanOptionalText(value: unknown, maxLength: number) {
  if (typeof value !== 'string') return undefined;
  const clean = value.trim().replace(/\s+/g, ' ').slice(0, maxLength);
  return clean || undefined;
}

function optionalConfidence(value: unknown) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? clamp(numeric, 0, 1) : undefined;
}

function finite(value: unknown, fallback: number) {
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
