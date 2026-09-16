import { Maximize2, Pause, Play, SkipBack, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import {
  audioTimelineItems,
  clipSourceTime,
  visualTimelineItems,
  zundamonVisualState,
} from '../render/timelineEvaluation';
import type { AssetMeta, Clip, Project } from '../types/editor';

interface Props {
  project: Project;
  time: number;
  playing: boolean;
  onTogglePlay: () => void;
  onTime: (time: number) => void;
}

function VisualLayer({ clip, asset, time, playing }: { clip: Clip; asset?: AssetMeta; time: number; playing: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sourceTime = clipSourceTime(clip, time);
  const playbackRate = Math.max(0.0625, Math.min(16, clip.speed ?? 1));

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (clip.reverse || !playing || Math.abs(video.currentTime - sourceTime) > 0.15) {
      video.currentTime = Math.max(0, sourceTime);
    }
  }, [clip.reverse, playing, sourceTime]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playbackRate;
    if (playing && !clip.reverse) video.play().catch(() => undefined);
    else video.pause();
  }, [clip.reverse, playbackRate, playing]);

  if (!asset?.objectUrl) return null;
  const transform = `translate(${clip.transform.x}px, ${clip.transform.y}px) scale(${clip.transform.scale}) rotate(${clip.transform.rotation}deg)`;
  const style = { transform, opacity: clip.transform.opacity };

  if (asset.kind === 'video') return <video ref={videoRef} className="previewMedia" src={asset.objectUrl} muted playsInline style={style} />;
  if (asset.kind === 'image') return <img className="previewMedia" src={asset.objectUrl} alt="" draggable={false} style={style} />;
  return null;
}

function ZundamonLayer({ clip, assets, time }: { clip: Clip; assets: AssetMeta[]; time: number }) {
  const state = zundamonVisualState(clip, time);
  if (!state.assetId) return null;
  const asset = assets.find((item) => item.id === state.assetId);
  if (!asset?.objectUrl) return null;

  const transform = `translate(${clip.transform.x}px, ${clip.transform.y + state.bobOffset}px) scale(${clip.transform.scale}) rotate(${clip.transform.rotation}deg)`;
  return <img className="previewMedia zundamonMedia" src={asset.objectUrl} alt="" draggable={false} style={{ transform, opacity: clip.transform.opacity }} />;
}

function AudioLayer({ clip, asset, time, playing, trackMuted }: { clip: Clip; asset?: AssetMeta; time: number; playing: boolean; trackMuted: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const sourceTime = clipSourceTime(clip, time);
  const playbackRate = Math.max(0.0625, Math.min(16, clip.speed ?? 1));

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, clip.volume));
    el.muted = clip.muted || trackMuted || Boolean(clip.reverse);
    el.playbackRate = playbackRate;
    if (clip.reverse || !playing || Math.abs(el.currentTime - sourceTime) > 0.18) {
      el.currentTime = Math.max(0, sourceTime);
    }
  }, [clip.muted, clip.reverse, clip.volume, playbackRate, playing, sourceTime, trackMuted]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (playing && !clip.reverse) el.play().catch(() => undefined);
    else el.pause();
  }, [clip.reverse, playing]);

  if (!asset?.objectUrl) return null;
  return <audio ref={ref} src={asset.objectUrl} preload="auto" />;
}

export function Preview({ project, time, playing, onTogglePlay, onTime }: Props) {
  const visuals = useMemo(() => visualTimelineItems(project, time), [project, time]);
  const audios = useMemo(() => audioTimelineItems(project, time), [project, time]);
  const aspect = `${project.width} / ${project.height}`;

  return (
    <section className="previewColumn">
      <div className="panel previewPanel">
        <div className="previewToolbar">
          <span>{project.width}×{project.height}</span>
          <span>{project.fps} fps</span>
          <button className="miniBtn"><Maximize2 size={14} /></button>
        </div>
        <div className="stageOuter">
          <div className="stage" style={{ aspectRatio: aspect, background: project.background }}>
            {visuals.map(({ clip }) => clip.kind === 'zundamon'
              ? <ZundamonLayer key={clip.id} clip={clip} assets={project.assets} time={time} />
              : <VisualLayer key={clip.id} clip={clip} asset={project.assets.find((asset) => asset.id === clip.assetId)} time={time} playing={playing} />)}
            {visuals.length === 0 && <div className="stageEmpty"><FilmIcon /><span>タイムラインに素材を追加</span></div>}
          </div>
        </div>
        {audios.map(({ clip, track }) => <AudioLayer key={clip.id} clip={clip} trackMuted={track.muted} asset={project.assets.find((asset) => asset.id === clip.assetId)} time={time} playing={playing} />)}
        <div className="transport">
          <button className="iconBtn" onClick={() => onTime(0)}><SkipBack size={17} /></button>
          <button className="playBtn" onClick={onTogglePlay}>{playing ? <Pause size={20} /> : <Play size={20} />}</button>
          <span className="timecode">{formatTime(time)}</span>
          <input type="range" min={0} max={project.duration} step={1 / project.fps} value={time} onChange={(e) => onTime(Number(e.target.value))} />
          <span className="timecode dim">{formatTime(project.duration)}</span>
          <Volume2 size={16} className="dim" />
        </div>
      </div>
    </section>
  );
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

function FilmIcon() {
  return <div className="emptyFilm">▣</div>;
}
