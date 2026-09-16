import { Maximize2, Pause, Play, SkipBack, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useRef, type CSSProperties } from 'react';
import {
  audioTimelineItems,
  clipSourceTime,
  visualTimelineItems,
  zundamonVisualState,
} from '../render/timelineEvaluation';
import { canvasFilterForEffects } from '../render/effectEvaluation';
import {
  deterministicNoiseByte,
  generatorColor,
  generatorNumber,
  hashString,
  resolveTextStyle,
} from '../render/syntheticLayers';
import type { AssetMeta, Clip, Project } from '../types/editor';
import '../preview-synthetic.css';

interface Props {
  project: Project;
  time: number;
  playing: boolean;
  onTogglePlay: () => void;
  onTime: (time: number) => void;
}

function clipPreviewTransform(clip: Clip, project: Project, extraY = 0) {
  const x = clip.transform.x / Math.max(1, project.width) * 100;
  const y = (clip.transform.y + extraY) / Math.max(1, project.height) * 100;
  return `translate(${x}%, ${y}%) scale(${clip.transform.scale}) rotate(${clip.transform.rotation}deg)`;
}

function layerStyle(clip: Clip, project: Project, time: number, extraY = 0): CSSProperties {
  const clipLocalTime = Math.max(0, Math.min(clip.duration, time - clip.start));
  return {
    transform: clipPreviewTransform(clip, project, extraY),
    transformOrigin: `${(clip.transform.anchorX ?? 0.5) * 100}% ${(clip.transform.anchorY ?? 0.5) * 100}%`,
    opacity: Math.max(0, Math.min(1, clip.transform.opacity)),
    mixBlendMode: clip.blendMode === 'add' ? 'plus-lighter' : clip.blendMode ?? 'normal',
    filter: canvasFilterForEffects(clip.effects ?? [], clipLocalTime),
  };
}

function VisualLayer({ clip, asset, project, time, playing }: { clip: Clip; asset?: AssetMeta; project: Project; time: number; playing: boolean }) {
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
  const style = layerStyle(clip, project, time);

  if (asset.kind === 'video') return <video ref={videoRef} className="previewMedia" src={asset.objectUrl} muted playsInline style={style} />;
  if (asset.kind === 'image') return <img className="previewMedia" src={asset.objectUrl} alt="" draggable={false} style={style} />;
  return null;
}

function ZundamonLayer({ clip, assets, project, time }: { clip: Clip; assets: AssetMeta[]; project: Project; time: number }) {
  const state = zundamonVisualState(clip, time);
  if (!state.assetId) return null;
  const asset = assets.find((item) => item.id === state.assetId);
  if (!asset?.objectUrl) return null;

  return <img className="previewMedia zundamonMedia" src={asset.objectUrl} alt="" draggable={false} style={layerStyle(clip, project, time, state.bobOffset)} />;
}

function SyntheticLayer({ clip, project, time }: { clip: Clip; project: Project; time: number }) {
  const common = layerStyle(clip, project, time);

  if (clip.kind === 'text' || clip.kind === 'subtitle') {
    const subtitle = clip.kind === 'subtitle' ? clip.subtitle?.text : undefined;
    const text = resolveTextStyle(clip.text ?? null, subtitle);
    if (!text.text) return null;
    const fontSizeCqw = text.fontSize / Math.max(1, project.width) * 100;
    const style: CSSProperties = {
      ...common,
      fontFamily: text.fontFamily,
      fontSize: `${fontSizeCqw}cqw`,
      fontWeight: text.fontWeight,
      color: text.color,
      textAlign: text.align,
      WebkitTextStroke: text.strokeColor && text.strokeWidth > 0 ? `${text.strokeWidth / Math.max(1, project.width) * 100}cqw ${text.strokeColor}` : undefined,
    };
    return (
      <div className="previewSynthetic previewTextLayer" style={style}>
        <div style={{ background: text.backgroundColor ?? undefined }}>{text.text}</div>
      </div>
    );
  }

  if (clip.kind === 'generator' && clip.generator) {
    const generator = clip.generator;
    if (generator.kind === 'bars') {
      return (
        <div className="previewSynthetic previewGenerator" style={common}>
          <div className="previewBarsTop" />
          <div className="previewBarsBottom" />
        </div>
      );
    }

    let background: string | undefined;
    if (generator.kind === 'gradient') {
      const angle = generatorNumber(generator, 'angle', 0, -360, 360);
      background = `linear-gradient(${90 + angle}deg, ${generatorColor(generator, 'startColor', '#161b22')}, ${generatorColor(generator, 'endColor', '#5fd8ff')})`;
    } else if (generator.kind === 'noise') {
      background = noiseDataUrl(clip.id, time, generatorNumber(generator, 'speed', 8, 0, 120));
    } else {
      background = generatorColor(generator, 'color', '#202830');
    }
    return <div className="previewSynthetic previewGenerator" style={{ ...common, background }} />;
  }

  return null;
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
            {visuals.map(({ clip }) => {
              if (clip.kind === 'zundamon') return <ZundamonLayer key={clip.id} clip={clip} assets={project.assets} project={project} time={time} />;
              if (clip.kind === 'text' || clip.kind === 'subtitle' || clip.kind === 'generator') {
                return <SyntheticLayer key={clip.id} clip={clip} project={project} time={time} />;
              }
              return <VisualLayer key={clip.id} clip={clip} project={project} asset={project.assets.find((asset) => asset.id === clip.assetId)} time={time} playing={playing} />;
            })}
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

function noiseDataUrl(clipId: string, timeSeconds: number, speed: number) {
  if (typeof document === 'undefined') return undefined;
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 18;
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  const image = context.createImageData(canvas.width, canvas.height);
  const seed = hashString(`${clipId}:${Math.floor(timeSeconds * speed)}`);
  for (let y = 0; y < canvas.height; y += 1) {
    for (let x = 0; x < canvas.width; x += 1) {
      const value = deterministicNoiseByte(seed, x, y);
      const offset = (y * canvas.width + x) * 4;
      image.data[offset] = value;
      image.data[offset + 1] = value;
      image.data[offset + 2] = value;
      image.data[offset + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  return `url(${canvas.toDataURL('image/png')})`;
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

function FilmIcon() {
  return <div className="emptyFilm">▣</div>;
}
