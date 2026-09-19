import { describe, expect, it } from 'vitest';
import type { TranscriptDocument } from '../types/editor';
import { detectTranscriptCleanupCandidates, mergeTranscriptCleanupMarkers, transcriptCleanupSummary, TRANSCRIPT_CLEANUP_NOTE_PREFIX } from './transcriptCleanup';

const source: TranscriptDocument = {
  id: 't',
  source: 'manual',
  updatedAt: '',
  segments: [
    { id: 'a', start: 0, end: 2, text: 'こんにちは' },
    { id: 'b', start: 5.5, end: 6.2, text: 'えっと' },
    { id: 'c', start: 6.3, end: 10, text: '本題です' },
    { id: 'd', start: 14, end: 14.5, text: 'あのー、' },
  ],
};

describe('transcript cleanup candidates', () => {
  it('detects transcript gaps above the pause threshold', () => {
    const result = detectTranscriptCleanupCandidates(source, { pauseThreshold: 2 });
    const pauses = result.filter((candidate) => candidate.kind === 'pause');
    expect(pauses).toHaveLength(2);
    expect(pauses[0]).toMatchObject({ start: 2, end: 5.5 });
    expect(pauses[1]).toMatchObject({ start: 10, end: 14 });
  });

  it('detects filler-only transcript segments with punctuation normalization', () => {
    const fillers = detectTranscriptCleanupCandidates(source)
      .filter((candidate) => candidate.kind === 'filler');
    expect(fillers.map((candidate) => candidate.segmentId)).toEqual(['b', 'd']);
    expect(fillers[0].matchedText).toBe('えっと');
  });

  it('does not flag filler words embedded inside meaningful sentences', () => {
    const transcript: TranscriptDocument = {
      id: 'embedded',
      source: 'manual',
      updatedAt: '',
      segments: [{ id: 'x', start: 0, end: 3, text: 'あの機能について説明します' }],
    };
    expect(detectTranscriptCleanupCandidates(transcript).filter((candidate) => candidate.kind === 'filler')).toEqual([]);
  });

  it('supports custom filler terms and a minimum filler duration', () => {
    const transcript: TranscriptDocument = {
      id: 'custom',
      source: 'manual',
      updatedAt: '',
      segments: [
        { id: 'a', start: 0, end: 0.2, text: 'ほげ' },
        { id: 'b', start: 1, end: 2, text: 'ほげ' },
      ],
    };
    const result = detectTranscriptCleanupCandidates(transcript, {
      fillerTerms: ['ほげ'],
      minFillerDuration: 0.5,
      pauseThreshold: 120,
    });
    expect(result).toMatchObject([{ kind: 'filler', segmentId: 'b', matchedText: 'ほげ' }]);
  });

  it('replaces only cleanup markers and preserves chapters/manual markers', () => {
    const candidates = detectTranscriptCleanupCandidates(source, { pauseThreshold: 2 });
    const merged = mergeTranscriptCleanupMarkers([
      { id: 'manual', time: 1, name: '手動', note: 'manual' },
      { id: 'chapter', time: 2, name: '章', note: 'auto-chapter:transcript' },
      { id: 'old-cleanup', time: 3, name: '古い候補', note: `${TRANSCRIPT_CLEANUP_NOTE_PREFIX}pause` },
    ], candidates);
    expect(merged.some((marker) => marker.id === 'manual')).toBe(true);
    expect(merged.some((marker) => marker.id === 'chapter')).toBe(true);
    expect(merged.some((marker) => marker.id === 'old-cleanup')).toBe(false);
    expect(merged.filter((marker) => marker.note?.startsWith(TRANSCRIPT_CLEANUP_NOTE_PREFIX))).toHaveLength(candidates.length);
  });

  it('summarizes candidate counts and removable pause time', () => {
    const summary = transcriptCleanupSummary(detectTranscriptCleanupCandidates(source, { pauseThreshold: 2 }));
    expect(summary.pauses).toBe(2);
    expect(summary.pauseSeconds).toBeCloseTo(7.5, 8);
    expect(summary.fillers).toBe(2);
  });

  it('returns no candidates without a transcript', () => {
    expect(detectTranscriptCleanupCandidates(undefined)).toEqual([]);
  });
});
