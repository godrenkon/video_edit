import { Captions, Copy, FileText, Flag, ListTree, RefreshCcw, Search, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  buildTranscriptFromSubtitleTracks,
  removeTranscriptSegment,
  searchTranscript,
  updateTranscriptSegment,
} from '../core/transcript';
import { buildTranscriptChapterCandidates, mergeAutoChapterMarkers, youtubeChapterText } from '../core/chapters';
import { applyTranscriptAsSubtitles } from '../core/transcriptCaptions';
import { detectTranscriptCleanupCandidates, mergeTranscriptCleanupMarkers, transcriptCleanupSummary } from '../core/transcriptCleanup';
import type { Project, TranscriptSegment } from '../types/editor';
import '../transcript-panel.css';

export function TranscriptPanel({
  project,
  onProject,
  onSeek,
}: {
  project: Project;
  onProject: (patch: Partial<Project>) => void;
  onSeek: (time: number) => void;
}) {
  const transcript = project.transcript;
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [chapterStatus, setChapterStatus] = useState('');

  const visibleSegments = useMemo(() => {
    if (!transcript) return [];
    if (!query.trim()) return transcript.segments.slice(0, 120);
    const byId = new Map(transcript.segments.map((segment) => [segment.id, segment]));
    return searchTranscript(transcript, query, 120)
      .map((hit) => byId.get(hit.segmentId))
      .filter((segment): segment is TranscriptSegment => Boolean(segment));
  }, [query, transcript]);

  const selected = transcript?.segments.find((segment) => segment.id === selectedId)
    ?? visibleSegments[0]
    ?? transcript?.segments[0]
    ?? null;
  const chapterCandidates = useMemo(
    () => buildTranscriptChapterCandidates(transcript),
    [transcript],
  );
  const cleanupCandidates = useMemo(
    () => detectTranscriptCleanupCandidates(transcript),
    [transcript],
  );
  const cleanupSummary = useMemo(
    () => transcriptCleanupSummary(cleanupCandidates),
    [cleanupCandidates],
  );

  useEffect(() => {
    if (!selectedId && selected) setSelectedId(selected.id);
    if (selectedId && transcript && !transcript.segments.some((segment) => segment.id === selectedId)) {
      setSelectedId(transcript.segments[0]?.id ?? '');
    }
  }, [selected, selectedId, transcript]);

  const rebuild = () => {
    const next = buildTranscriptFromSubtitleTracks(project);
    onProject({ transcript: next });
    setSelectedId(next.segments[0]?.id ?? '');
    setQuery('');
  };

  const patchSelected = (patch: Partial<Pick<TranscriptSegment, 'text' | 'speaker' | 'start' | 'end'>>) => {
    if (!transcript || !selected) return;
    onProject({ transcript: updateTranscriptSegment(transcript, selected.id, patch) });
  };

  const removeSelected = () => {
    if (!transcript || !selected) return;
    const next = removeTranscriptSegment(transcript, selected.id);
    onProject({ transcript: next });
    setSelectedId(next.segments[0]?.id ?? '');
  };

  const generateChapterMarkers = () => {
    if (!chapterCandidates.length) return;
    onProject({ markers: mergeAutoChapterMarkers(project.markers, chapterCandidates) });
    setChapterStatus(`${chapterCandidates.length}個の自動チャプターマーカーを更新しました`);
  };

  const copyYoutubeChapters = async () => {
    if (!chapterCandidates.length) return;
    const value = youtubeChapterText(chapterCandidates);
    try {
      await navigator.clipboard.writeText(value);
      setChapterStatus('YouTube用チャプターをコピーしました');
    } catch {
      setChapterStatus('コピーできませんでした。ブラウザのクリップボード権限を確認してください');
    }
  };

  const generateTranscriptSubtitles = () => {
    const result = applyTranscriptAsSubtitles(project);
    if (result.reason === 'no-transcript') {
      setChapterStatus('字幕へ変換できるトランスクリプトがありません');
      return;
    }
    if (result.reason === 'locked-track') {
      setChapterStatus('Transcript字幕トラックがロックされています');
      return;
    }
    onProject({ tracks: result.project.tracks, duration: result.project.duration });
    setChapterStatus(`${result.clipCount}個の字幕クリップをTranscript字幕トラックへ生成しました`);
  };

  const generateCleanupMarkers = () => {
    onProject({ markers: mergeTranscriptCleanupMarkers(project.markers, cleanupCandidates) });
    setChapterStatus(
      `Transcript分析: 無言候補 ${cleanupSummary.pauses}件 / フィラー ${cleanupSummary.fillers}件をマーカーへ反映しました`,
    );
  };

  return (
    <section className="transcriptPanel">
      <div className="transcriptHeader">
        <div>
          <strong><FileText size={13} />トランスクリプト</strong>
          <span>{transcript?.segments.length ?? 0} segments</span>
        </div>
        <div className="transcriptHeaderActions">
          <button type="button" onClick={rebuild} title="字幕トラックから再生成"><RefreshCcw size={12} />字幕から生成</button>
          <button type="button" onClick={() => { onProject({ transcript: undefined }); setSelectedId(''); }} disabled={!transcript} title="トランスクリプトを削除"><X size={12} /></button>
        </div>
      </div>

      {!transcript ? (
        <div className="transcriptEmpty">字幕トラックからタイムコード付きトランスクリプトを生成できます。</div>
      ) : (
        <>
          <div className="transcriptSearch">
            <Search size={12} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="本文・話者・単語を検索" />
            <span>{visibleSegments.length}</span>
          </div>

          <div className="transcriptChapterTools">
            <button type="button" onClick={generateTranscriptSubtitles} disabled={!transcript.segments.length} title="トランスクリプトから専用字幕トラックを生成">
              <Captions size={12} />字幕トラック生成
            </button>
            <button type="button" onClick={generateChapterMarkers} disabled={chapterCandidates.length === 0} title="Transcriptの時間ギャップから章候補を生成">
              <ListTree size={12} />章マーカー生成
            </button>
            <button type="button" onClick={copyYoutubeChapters} disabled={chapterCandidates.length === 0} title="YouTube概要欄用チャプターテキストをコピー">
              <Copy size={12} />YouTube章をコピー
            </button>
            <span>{chapterCandidates.length} chapters</span>
          </div>
          <div className="transcriptCleanupTools">
            <button type="button" onClick={generateCleanupMarkers} disabled={cleanupCandidates.length === 0} title="Transcriptの時間ギャップとフィラーだけを分析します。音声VADではありません。">
              <Flag size={12} />無言/フィラー候補
            </button>
            <span>無言 {cleanupSummary.pauses} · {cleanupSummary.pauseSeconds.toFixed(1)}s / フィラー {cleanupSummary.fillers}</span>
            <em>Transcriptベース分析</em>
          </div>
          {chapterStatus && <div className="transcriptChapterStatus">{chapterStatus}</div>}

          <div className="transcriptList">
            {visibleSegments.length === 0 && <div className="transcriptEmpty">一致するsegmentはありません。</div>}
            {visibleSegments.map((segment) => (
              <button
                type="button"
                key={segment.id}
                className={segment.id === selected?.id ? 'active' : ''}
                onClick={() => {
                  setSelectedId(segment.id);
                  onSeek(segment.start);
                }}
              >
                <time>{formatTime(segment.start)}</time>
                <span>
                  {segment.speaker && <b>{segment.speaker}</b>}
                  <em>{compact(segment.text)}</em>
                </span>
              </button>
            ))}
          </div>

          {selected && (
            <div className="transcriptEditor">
              <div className="transcriptEditorTimes">
                <label><span>Start</span><input type="number" min={0} step={1 / Math.max(1, project.fps)} value={round(selected.start)} onChange={(event) => patchSelected({ start: Number(event.target.value) })} /></label>
                <label><span>End</span><input type="number" min={0} step={1 / Math.max(1, project.fps)} value={round(selected.end)} onChange={(event) => patchSelected({ end: Number(event.target.value) })} /></label>
              </div>
              <label><span>話者</span><input value={selected.speaker ?? ''} onChange={(event) => patchSelected({ speaker: event.target.value })} placeholder="話者名" /></label>
              <label><span>本文</span><textarea rows={4} value={selected.text} onChange={(event) => patchSelected({ text: event.target.value })} /></label>
              <div className="transcriptEditorFooter">
                <span>{selected.words?.length ? `${selected.words.length} timed words` : 'word timingなし'}</span>
                <button type="button" className="danger" onClick={removeSelected}><Trash2 size={12} />segment削除</button>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function compact(value: string) {
  const clean = value.replace(/\s+/g, ' ').trim();
  return clean.length > 72 ? `${clean.slice(0, 69)}…` : clean;
}

function round(value: number) {
  return Number(Math.max(0, value).toFixed(3));
}

function formatTime(value: number) {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const minutes = Math.floor(safe / 60);
  const seconds = safe - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(2).padStart(5, '0')}`;
}
