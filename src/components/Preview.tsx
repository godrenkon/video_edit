import { Maximize2, Pause, Play, SkipBack, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useRef } from 'react';
import type { AssetMeta, Clip, Project } from '../types/editor';

interface Props {
  project: Project;
  time: number;
  playing: boolean;
  onTogglePlay: () => void;
  onTime: (time: number) => void;
}

function cueState(clip: Clip, time: number) {
  const z = clip.zundamon;
  if (!z) return 0;
  const local = Math.max(0, time - clip.start);
  const index = Math.min(z.cues.length - 1, Math.floor(local / 0.045));
  return z.cues[Math.max(0, index)]?.state ?? 0;
}

function VisualLayer({ clip, asset, time, playing }: { clip: Clip; asset?: AssetMeta; time: number; playing: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const local = clip.inPoint + Math.max(0, time - clip.start);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (Math.abs(video.currentTime - local) > 0.15) video.currentTime = Math.max(0, local);
  }, [local]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (playing) video.play().catch(() => undefined);
    else video.pause();
  }, [playing]);

  if (!asset?.objectUrl) return null;
  const transform = `translate(${clip.transform.x}px, ${clip.transform.y}px) scale(${clip.transform.scale}) rotate(${clip.transform.rotation}deg)`;
  const style = { transform, opacity: clip.transform.opacity };

  if (asset.kind === 'video') return <video ref={videoRef} className="previewMedia" src={asset.objectUrl} muted playsInline style={style} />;
  if (asset.kind === 'image') return <img className="previewMedia" src={asset.objectUrl} alt="" draggable={false} style={style} />;
  return null;
}

function ZundamonLayer({ clip, assets, time }: { clip: Clip; assets: AssetMeta[]; time: number }) {
  if (!clip.zundamon) return null;
  const z = clip.zundamon;
  const local = Math.max(0, time - clip.start);
  const blinkPhase = local % Math.max(1.5, z.blinkEvery);
  const blinking = Boolean(z.blinkAssetId) && blinkPhase > z.blinkEvery - 0.13;
  const mouth = cueState(clip, time);
  let id = mouth === 2 ? z.openAssetId : mouth === 1 ? (z.halfAssetId || z.openAssetId) : z.closedAssetId;
  if (blinking) id = z.blinkAssetId!;
  const asset = assets.find((a) => a.id === id);
  if (!asset?.objectUrl) return null;

  const bob = Math.sin(local * Math.PI * 2 * z.bobSpeed) * z.bobAmount;
  const transform = `translate(${clip.transform.x}px, ${clip.transform.y + bob}px) scale(${clip.transform.scale}) rotate(${clip.transform.rotation}deg)`;
  return <img className="previewMedia zundamonMedia" src={asset.objectUrl} alt="" draggable={false} style={{ transform, opacity: clip.transform.opacity }} />;
}

function AudioLayer({ clip, asset, time, playing, trackMuted }: { clip: Clip; asset?: AssetMeta; time: number; playing: boolean; trackMuted: boolean }) {
  const ref = useRef<HTMLAudioElement>(null);
  const local = clip.inPoint + Math.max(0, time - clip.start);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, clip.volume));
    el.muted = clip.muted || trackMuted;
    if (Math.abs(el.currentTime - local) > 0.18) el.currentTime = Math.max(0, local);
  }, [local, clip.volume, clip.muted, trackMuted]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (playing) el.play().catch(() => undefined);
    else el.pause();
  }, [playing]);

  if (!asset?.objectUrl) return null;
  return <audio ref={ref} src={asset.objectUrl} preload="auto" />;
}

export function Preview({ project, time, playing, onTogglePlay, onTime }: Props) {
  const active = useMemo(() => project.tracks.flatMap((track, trackIndex) =>
    track.clips
      .filter((clip) => time >= clip.start && time < clip.start + clip.duration)
      .map((clip) => ({ track, clip, trackIndex }))), [project.tracks, time]);

  const visuals = active.filter(({ track }) => track.kind !== 'audio').sort((a, b) => b.trackIndex - a.trackIndex);
  const audios = active.filter(({ track }) => track.kind === 'audio');
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
              : <VisualLayer key={clip.id} clip={clip} asset={project.assets.find((a) => a.id === clip.assetId)} time={time} playing={playing} />)}
            {visuals.length === 0 && <div className="stageEmpty"><FilmIcon /><span>タイムラインに素材を追加</span></div>}
          </div>
        </div>
        {audios.map(({ clip, track }) => <AudioLayer key={clip.id} clip={clip} trackMuted={track.muted} asset={project.assets.find((a) => a.id === clip.assetId)} time={time} playing={playing} />)}
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
