import { describe, expect, it } from 'vitest';
import type { TimelineMarker, TranscriptDocument } from '../types/editor';
import {
  AUTO_CHAPTER_NOTE,
  buildTranscriptChapterCandidates,
  mergeAutoChapterMarkers,
  youtubeChapterText,
} from './chapters';

function transcript(): TranscriptDocument {
  return {
    id: 't',
    source: 'manual',
    updatedAt: '',
    segments: [
      { id: 'a', start: 2, end: 20, text: 'イントロです' },
      { id: 'b', start: 22, end: 50, text: '準備と必要なもの' },
      { id: 'c', start: 56, end: 80, text: '最初の設定を進めます' },
      { id: 'd', start: 205, end: 230, text: '応用設定を見ていきます', speaker: 'ずんだもん' },
      { id: 'e', start: 236, end: 260, text: '最後にまとめます' },
    ],
  };
}

describe('transcript auto chapters', () => {
  it('starts at 0:00 and uses natural transcript gaps', () => {
    const chapters = buildTranscriptChapterCandidates(transcript(), {
      minChapterDuration: 30,
      maxChapterDuration: 180,
      gapThreshold: 5,
    });
    expect(chapters[0]).toMatchObject({ time: 0, title: 'イントロです', sourceSegmentId: 'a' });
    expect(chapters.some((chapter) => chapter.sourceSegmentId === 'c')).toBe(true);
    expect(chapters.some((chapter) => chapter.sourceSegmentId === 'd')).toBe(true);
  });

  it('forces a chapter after max duration even without a large silence gap', () => {
    const source: TranscriptDocument = {
      id: 'long',
      source: 'manual',
      updatedAt: '',
      segments: [
        { id: 'a', start: 0, end: 40, text: 'A' },
        { id: 'b', start: 45, end: 80, text: 'B' },
        { id: 'c', start: 90, end: 120, text: 'C' },
      ],
    };
    const chapters = buildTranscriptChapterCandidates(source, {
      minChapterDuration: 20,
      maxChapterDuration: 80,
      gapThreshold: 30,
    });
    expect(chapters.map((chapter) => chapter.sourceSegmentId)).toEqual(['a', 'c']);
  });

  it('replaces only generated chapter markers and preserves manual markers', () => {
    const markers: TimelineMarker[] = [
      { id: 'manual', time: 12, name: '手動', color: '#fff' },
      { id: 'old-auto', time: 30, name: '古い自動章', note: AUTO_CHAPTER_NOTE },
    ];
    const merged = mergeAutoChapterMarkers(markers, [
      { time: 0, title: 'Intro', sourceSegmentId: 'a' },
      { time: 90, title: 'Main', sourceSegmentId: 'c' },
    ]);
    expect(merged.some((marker) => marker.id === 'manual')).toBe(true);
    expect(merged.some((marker) => marker.id === 'old-auto')).toBe(false);
    expect(merged.filter((marker) => marker.note === AUTO_CHAPTER_NOTE)).toHaveLength(2);
  });

  it('formats YouTube chapter timestamps including hour-long projects', () => {
    expect(youtubeChapterText([
      { time: 0, title: 'Intro', sourceSegmentId: 'a' },
      { time: 65.9, title: 'Setup', sourceSegmentId: 'b' },
      { time: 3661, title: 'Long', sourceSegmentId: 'c' },
    ])).toBe('0:00 Intro\n1:05 Setup\n1:01:01 Long');
  });

  it('returns no candidates without usable transcript segments', () => {
    expect(buildTranscriptChapterCandidates(undefined)).toEqual([]);
    expect(buildTranscriptChapterCandidates({ id: 'empty', source: 'manual', updatedAt: '', segments: [] })).toEqual([]);
  });
});
