import { Download, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { addTrack } from '../core/trackOps';
import {
  subtitleClipsFromSrt,
  subtitleClipsFromWebVtt,
  subtitleClipsToSrt,
  subtitleClipsToWebVtt,
} from '../core/subtitles';
import type { Project } from '../types/editor';
import '../subtitle-exchange.css';

type SubtitleFileFormat = 'srt' | 'vtt';

interface Props {
  project: Project;
  onProject: (patch: Partial<Project>) => void;
}

export function SubtitleExchangePanel({ project, onProject }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const importFormatRef = useRef<SubtitleFileFormat>('srt');
  const [status, setStatus] = useState('');
  const subtitleClips = project.tracks
    .filter((track) => track.kind === 'subtitle')
    .flatMap((track) => track.clips)
    .filter((clip) => clip.kind === 'subtitle');

  const chooseImport = (format: SubtitleFileFormat) => {
    importFormatRef.current = format;
    inputRef.current?.click();
  };

  const importSubtitles = async (file: File | undefined) => {
    if (!file) return;
    const format = importFormatRef.current;
    try {
      const text = await file.text();
      const options = { y: project.height * 0.34 };
      const clips = format === 'vtt'
        ? subtitleClipsFromWebVtt(text, options)
        : subtitleClipsFromSrt(text, options);
      if (clips.length === 0) {
        setStatus(`有効な${formatLabel(format)}字幕キューが見つかりませんでした`);
        return;
      }

      let next = project;
      let subtitleTrack = next.tracks.find((track) => track.kind === 'subtitle' && !track.locked);
      if (!subtitleTrack) {
        next = addTrack(next, 'subtitle', { name: '字幕' });
        subtitleTrack = next.tracks.find((track) => track.kind === 'subtitle' && !track.locked);
      }
      if (!subtitleTrack) throw new Error('編集可能な字幕トラックを作成できませんでした');

      const trackId = subtitleTrack.id;
      const tracks = next.tracks.map((track) => track.id === trackId
        ? { ...track, clips: [...track.clips, ...clips].sort((a, b) => a.start - b.start) }
        : track);
      onProject({ tracks });
      setStatus(`${formatLabel(format)}から${clips.length}件の字幕を追加しました`);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? `読み込みエラー: ${error.message}` : `${formatLabel(format)}読み込みエラー`);
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const exportSubtitles = (format: SubtitleFileFormat) => {
    const text = format === 'vtt'
      ? subtitleClipsToWebVtt(subtitleClips)
      : subtitleClipsToSrt(subtitleClips);
    const hasCues = subtitleClips.length > 0 && (format === 'vtt' ? text.trim() !== 'WEBVTT' : Boolean(text));
    if (!hasCues) {
      setStatus('書き出せる字幕がありません');
      return;
    }

    const isVtt = format === 'vtt';
    const blob = new Blob([isVtt ? text : `\uFEFF${text}`], {
      type: isVtt ? 'text/vtt;charset=utf-8' : 'application/x-subrip;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${sanitizeFileName(project.name)}.${format}`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setStatus(`${subtitleClips.length}件の字幕を${formatLabel(format)}で書き出しました`);
  };

  return (
    <section className="subtitleExchangeCard">
      <div className="subtitleExchangeTitle">
        <strong>字幕交換 SRT / WebVTT</strong>
        <span>{subtitleClips.length} clips</span>
      </div>
      <div className="subtitleExchangeActions">
        <button type="button" onClick={() => chooseImport('srt')}><Upload size={12} />SRT読込</button>
        <button type="button" onClick={() => exportSubtitles('srt')} disabled={subtitleClips.length === 0}><Download size={12} />SRT出力</button>
        <button type="button" onClick={() => chooseImport('vtt')}><Upload size={12} />VTT読込</button>
        <button type="button" onClick={() => exportSubtitles('vtt')} disabled={subtitleClips.length === 0}><Download size={12} />VTT出力</button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={importFormatRef.current === 'vtt' ? '.vtt,text/vtt,text/plain' : '.srt,application/x-subrip,text/plain'}
        hidden
        onChange={(event) => importSubtitles(event.target.files?.[0])}
      />
      <div className="subtitleExchangeNote">読み込みは既存字幕を残したまま編集可能な字幕トラックへ追記します。SRT/VTTとも内部では同じ字幕クリップとして編集できます。</div>
      {status && <div className="subtitleExchangeStatus">{status}</div>}
    </section>
  );
}

function formatLabel(format: SubtitleFileFormat) {
  return format === 'vtt' ? 'WebVTT' : 'SRT';
}

function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'subtitles';
}
