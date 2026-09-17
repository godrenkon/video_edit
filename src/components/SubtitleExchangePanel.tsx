import { Download, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { addTrack } from '../core/trackOps';
import { subtitleClipsFromSrt, subtitleClipsToSrt } from '../core/subtitles';
import type { Project } from '../types/editor';
import '../subtitle-exchange.css';

interface Props {
  project: Project;
  onProject: (patch: Partial<Project>) => void;
}

export function SubtitleExchangePanel({ project, onProject }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState('');
  const subtitleClips = project.tracks
    .filter((track) => track.kind === 'subtitle')
    .flatMap((track) => track.clips)
    .filter((clip) => clip.kind === 'subtitle');

  const importSrt = async (file: File | undefined) => {
    if (!file) return;
    try {
      const text = await file.text();
      const clips = subtitleClipsFromSrt(text, { y: project.height * 0.34 });
      if (clips.length === 0) {
        setStatus('有効な字幕キューが見つかりませんでした');
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
      setStatus(`${clips.length}件の字幕を追加しました`);
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? `読み込みエラー: ${error.message}` : 'SRT読み込みエラー');
    } finally {
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const exportSrt = () => {
    const text = subtitleClipsToSrt(subtitleClips);
    if (!text) {
      setStatus('書き出せる字幕がありません');
      return;
    }
    const blob = new Blob([`\uFEFF${text}`], { type: 'application/x-subrip;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${sanitizeFileName(project.name)}.srt`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
    setStatus(`${subtitleClips.length}件の字幕を書き出しました`);
  };

  return (
    <section className="subtitleExchangeCard">
      <div className="subtitleExchangeTitle">
        <strong>SRT字幕</strong>
        <span>{subtitleClips.length} clips</span>
      </div>
      <div className="subtitleExchangeActions">
        <button type="button" onClick={() => inputRef.current?.click()}><Upload size={12} />SRT読み込み</button>
        <button type="button" onClick={exportSrt} disabled={subtitleClips.length === 0}><Download size={12} />SRT書き出し</button>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".srt,application/x-subrip,text/plain"
        hidden
        onChange={(event) => importSrt(event.target.files?.[0])}
      />
      <div className="subtitleExchangeNote">読み込みは既存字幕を残したまま編集可能な字幕トラックへ追記します。</div>
      {status && <div className="subtitleExchangeStatus">{status}</div>}
    </section>
  );
}

function sanitizeFileName(name: string) {
  return name.replace(/[\\/:*?"<>|]/g, '_').trim() || 'subtitles';
}
