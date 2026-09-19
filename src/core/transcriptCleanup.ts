import type { TranscriptDocument, TranscriptSegment } from '../types/editor';

export type TranscriptCleanupCandidateKind = 'pause' | 'filler';

export interface TranscriptCleanupCandidate {
  id: string;
  kind: TranscriptCleanupCandidateKind;
  start: number;
  end: number;
  label: string;
  segmentId?: string;
  matchedText?: string;
}

export interface TranscriptCleanupOptions {
  pauseThreshold?: number;
  minFillerDuration?: number;
  fillerTerms?: string[];
}

const DEFAULT_FILLERS = [
  'えー',
  'ええと',
  'えっと',
  'あの',
  'あのー',
  'その',
  'そのー',
  'まあ',
  'まー',
  'うーん',
  'んー',
  'uh',
  'um',
  'erm',
  'like',
];

export function detectTranscriptCleanupCandidates(
  transcript: TranscriptDocument | undefined,
  options: TranscriptCleanupOptions = {},
): TranscriptCleanupCandidate[] {
  if (!transcript?.segments.length) return [];

  const pauseThreshold = clampFinite(options.pauseThreshold, 0.5, 120, 2);
  const minFillerDuration = clampFinite(options.minFillerDuration, 0, 10, 0);
  const fillerTerms = normalizeFillers(options.fillerTerms ?? DEFAULT_FILLERS);
  const segments = [...transcript.segments]
    .filter(validSegment)
    .sort((a, b) => a.start - b.start || a.end - b.end);
  const result: TranscriptCleanupCandidate[] = [];

  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1];
    const current = segments[index];
    const gapStart = Math.max(0, previous.end);
    const gapEnd = Math.max(gapStart, current.start);
    if (gapEnd - gapStart >= pauseThreshold) {
      result.push({
        id: `pause_${previous.id}_${current.id}`,
        kind: 'pause',
        start: gapStart,
        end: gapEnd,
        label: `${formatDuration(gapEnd - gapStart)} の無言候補`,
      });
    }
  }

  for (const segment of segments) {
    const normalized = normalizeText(segment.text);
    if (!normalized) continue;
    const matched = fillerTerms.find((term) => isFillerOnly(normalized, term));
    if (!matched) continue;
    if (segment.end - segment.start < minFillerDuration) continue;
    result.push({
      id: `filler_${segment.id}`,
      kind: 'filler',
      start: segment.start,
      end: segment.end,
      label: `フィラー候補: ${segment.text.trim()}`,
      segmentId: segment.id,
      matchedText: matched,
    });
  }

  return result.sort((a, b) => a.start - b.start || a.end - b.end || a.kind.localeCompare(b.kind));
}

export function transcriptCleanupSummary(candidates: TranscriptCleanupCandidate[]) {
  const pauses = candidates.filter((candidate) => candidate.kind === 'pause');
  const fillers = candidates.filter((candidate) => candidate.kind === 'filler');
  return {
    pauses: pauses.length,
    pauseSeconds: pauses.reduce((sum, candidate) => sum + Math.max(0, candidate.end - candidate.start), 0),
    fillers: fillers.length,
  };
}

function isFillerOnly(text: string, filler: string) {
  if (text === filler) return true;
  const punctuationStripped = text.replace(/[。、，,.!?！？…〜~ー\-\s]/g, '');
  const fillerStripped = filler.replace(/[。、，,.!?！？…〜~ー\-\s]/g, '');
  return punctuationStripped === fillerStripped;
}

function normalizeFillers(values: string[]) {
  return [...new Set(values.map(normalizeText).filter(Boolean))].slice(0, 100);
}

function normalizeText(value: string) {
  return value.normalize('NFKC').trim().toLocaleLowerCase('ja');
}

function validSegment(segment: TranscriptSegment) {
  return Boolean(
    segment.text.trim()
    && Number.isFinite(segment.start)
    && Number.isFinite(segment.end)
    && segment.end > segment.start,
  );
}

function formatDuration(value: number) {
  return `${Math.max(0, value).toFixed(value >= 10 ? 1 : 2)}s`;
}

function clampFinite(value: number | undefined, min: number, max: number, fallback: number) {
  const safe = typeof value === 'number' && Number.isFinite(value) ? value : fallback;
  return Math.max(min, Math.min(max, safe));
}
