import { Maximize2, Minimize2, Pause, Play, SkipBack, Volume2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  audioTimelineItems,
  clipLocalTime,
  clipSourceTime,
  visualTimelineItems,
  zundamonVisualState,
} from '../render/timelineEvaluation';
import { previewCropLayout } from '../render/cropGeometry';
import { canvasFilterForEffects, resolveTemperatureTintEffects, resolveVignetteEffects, vignetteCssBackground } from '../render/effectEvaluation';
import { PreviewAudioGraph } from '../render/previewAudioGraph';
import { previewSyncTolerance } from '../render/previewClock';
import { transitionBrightness, transitionMotionOffset, transitionOpacity, transitionRevealRect } from '../render/transitionEnvelope';
import { activeSubtitleHighlight, normalizeSubtitleHighlightColor } from '../render/subtitleHighlight';
import {
  deterministicNoiseByte,
  generatorColor,
  generatorNumber,
  hashString,
  resolveTextStyle,
} from '../render/syntheticLayers';
import type { AssetMeta, Clip, Project } from '../types/editor';
import { PlaybackDiagnostics } from './PlaybackDiagnostics';
import { PausedPreviewCanvas } from './PausedPreviewCanvas';
import { RealtimeProcessedPreviewCanvas } from './RealtimeProcessedPreviewCanvas';
import { hasPixelEffects } from '../render/pixelEffects';
import { PreviewAudioMeter } from './PreviewAudioMeter';
import '../preview-synthetic.css';

interface Props {
  project: Project;
  time: number;
  playing: boolean;
  onTogglePlay: () => void;
  onTime: (time: number) => void;
}

function clipPreviewTransform(clip: Clip, project: Project, clipLocalTime: number, extraY = 0) {
  const transitionOffset = transitionMotionOffset(clip, clipLocalTime, project.width, project.height);
  const x = (clip.transform.x + transitionOffset.x) / Math.max(1, project.width) * 100;
  const y = (clip.transform.y + transitionOffset.y + extraY) / Math.max(1, project.height) * 100;
  return `translate(${x}%, ${y}%) scale(${clip.transform.scale}) rotate(${clip.transform.rotation}deg)`;
}

function transitionClipPath(clip: Clip, clipLocalTime: number) {
  const reveal = transitionRevealRect(clip, clipLocalTime);
  if (reveal.x <= 0 && reveal.y <= 0 && reveal.width >= 1 && reveal.height >= 1) return undefined;
  const top = reveal.y * 100;
  const right = (1 - reveal.x - reveal.width) * 100;
  const bottom = (1 - reveal.y - reveal.height) * 100;
  const left = reveal.x * 100;
  return `inset(${top}% ${right}% ${bottom}% ${left}%)`;
}

function previewVisualFilter(clip: Clip, clipLocalTime: number) {
  const effectFilter = canvasFilterForEffects(clip.effects ?? [], clipLocalTime);
  const brightness = transitionBrightness(clip, clipLocalTime);
  if (brightness >= 0.999999) return effectFilter;
  const dip = `brightness(${Math.max(0, Math.min(1, brightness))})`;
  return effectFilter && effectFilter !== 'none' ? `${effectFilter} ${dip}` : dip;
}

function layerStyle(clip: Clip, project: Project, time: number, extraY = 0): CSSProperties {
  const clipLocal = Math.max(0, Math.min(clip.duration, time - clip.start));
  return {
    transform: clipPreviewTransform(clip, project, clipLocal, extraY),
    transformOrigin: `${(clip.transform.anchorX ?? 0.5) * 100}% ${(clip.transform.anchorY ?? 0.5) * 100}%`,
    opacity: Math.max(0, Math.min(1, clip.transform.opacity * transitionOpacity(clip, clipLocal))),
    mixBlendMode: clip.blendMode === 'add' ? 'plus-lighter' : clip.blendMode ?? 'normal',
    filter: previewVisualFilter(clip, clipLocal),
    clipPath: transitionClipPath(clip, clipLocal),
  };
}

function assetLayerStyles(
  clip: Clip,
  asset: AssetMeta,
  project: Project,
  time: number,
  extraY = 0,
): { frame: CSSProperties; source: CSSProperties } | null {
  const layout = previewCropLayout(
    asset.width ?? project.width,
    asset.height ?? project.height,
    project.width,
    project.height,
    clip.crop ?? null,
  );
  if (!layout) return null;

  const clipLocal = Math.max(0, Math.min(clip.duration, time - clip.start));
  const anchorX = Math.max(0, Math.min(1, clip.transform.anchorX ?? 0.5));
  const anchorY = Math.max(0, Math.min(1, clip.transform.anchorY ?? 0.5));
  const transitionOffset = transitionMotionOffset(clip, clipLocal, project.width, project.height);
  const xPercent = (clip.transform.x + transitionOffset.x) / Math.max(1, project.width) * 100;
  const yPercent = (clip.transform.y + transitionOffset.y + extraY) / Math.max(1, project.height) * 100;

  return {
    frame: {
      position: 'absolute',
      left: `${50 + xPercent}%`,
      top: `${50 + yPercent}%`,
      width: `${layout.frameWidthPercent}%`,
      height: `${layout.frameHeightPercent}%`,
      overflow: 'hidden',
      transformOrigin: '0 0',
      transform: `rotate(${clip.transform.rotation}deg) scale(${clip.transform.scale}) translate(${-anchorX * 100}%, ${-anchorY * 100}%)`,
      opacity: Math.max(0, Math.min(1, clip.transform.opacity * transitionOpacity(clip, clipLocal))),
      mixBlendMode: clip.blendMode === 'add' ? 'plus-lighter' : clip.blendMode ?? 'normal',
      filter: previewVisualFilter(clip, clipLocal),
      clipPath: transitionClipPath(clip, clipLocal),
      pointerEvents: 'none',
    },
    source: {
      position: 'absolute',
      left: `${layout.sourceLeftPercent}%`,
      top: `${layout.sourceTopPercent}%`,
      width: `${layout.sourceWidthPercent}%`,
      height: `${layout.sourceHeightPercent}%`,
      maxWidth: 'none',
      maxHeight: 'none',
      objectFit: 'fill',
      userSelect: 'none',
      pointerEvents: 'none',
    },
  };
}

function VisualLayer({ clip, asset, project, time, playing }: { clip: Clip; asset?: AssetMeta; project: Project; time: number; playing: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const sourceTime = clipSourceTime(clip, time);
  const playbackRate = Math.max(0.0625, Math.min(16, clip.speed ?? 1));
  const syncTolerance = previewSyncTolerance(project.fps);
  const frozen = typeof clip.freezeFrameAt === 'number' && Number.isFinite(clip.freezeFrameAt);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (clip.reverse || frozen || !playing || Math.abs(video.currentTime - sourceTime) > syncTolerance) {
      video.currentTime = Math.max(0, sourceTime);
    }
  }, [clip.reverse, frozen, playing, sourceTime, syncTolerance]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = playbackRate;
    if (playing && !clip.reverse && !frozen) video.play().catch(() => undefined);
    else video.pause();
  }, [clip.reverse, frozen, playbackRate, playing]);

  if (!asset) return null;
  const mediaUrl = asset.kind === 'video' ? (asset.proxyObjectUrl ?? asset.objectUrl) : asset.objectUrl;
  if (!mediaUrl) return null;
  const styles = assetLayerStyles(clip, asset, project, time);
  if (!styles) return null;

  if (asset.kind === 'video') {
    return (
      <div className="previewAssetFrame" style={styles.frame}>
        <video ref={videoRef} className="previewAssetSource" src={mediaUrl} muted playsInline style={styles.source} />
        <VisualEffectOverlays clip={clip} time={time} />
      </div>
    );
  }
  if (asset.kind === 'image') {
    return (
      <div className="previewAssetFrame" style={styles.frame}>
        <img className="previewAssetSource" src={mediaUrl} alt="" draggable={false} style={styles.source} />
        <VisualEffectOverlays clip={clip} time={time} />
      </div>
    );
  }
  return null;
}

function ZundamonLayer({ clip, assets, project, time }: { clip: Clip; assets: AssetMeta[]; project: Project; time: number }) {
  const state = zundamonVisualState(clip, time);
  if (!state.assetId) return null;
  const asset = assets.find((item) => item.id === state.assetId);
  if (!asset?.objectUrl) return null;
  const styles = assetLayerStyles(clip, asset, project, time, state.bobOffset);
  if (!styles) return null;

  return (
    <div className="previewAssetFrame" style={styles.frame}>
      <img className="previewAssetSource zundamonMedia" src={asset.objectUrl} alt="" draggable={false} style={styles.source} />
      <VisualEffectOverlays clip={clip} time={time} />
    </div>
  );
}

function SyntheticLayer({ clip, project, time }: { clip: Clip; project: Project; time: number }) {
  const common = layerStyle(clip, project, time);

  if (clip.kind === 'text' || clip.kind === 'subtitle') {
    const subtitle = clip.kind === 'subtitle' ? clip.subtitle?.text : undefined;
    const text = resolveTextStyle(clip.text ?? null, subtitle);
    const highlight = clip.kind === 'subtitle'
      ? activeSubtitleHighlight(clip.subtitle, Math.max(0, time - clip.start))
      : null;
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
      textShadow: text.shadowColor && (text.shadowBlur > 0 || text.shadowOffsetX !== 0 || text.shadowOffsetY !== 0)
        ? `${text.shadowOffsetX / Math.max(1, project.width) * 100}cqw ${text.shadowOffsetY / Math.max(1, project.width) * 100}cqw ${text.shadowBlur / Math.max(1, project.width) * 100}cqw ${text.shadowColor}`
        : undefined,
    };
    const highlightedText = highlight && subtitle === text.text
      ? (
          <>
            {text.text.slice(0, highlight.charStart)}
            <span className="subtitleActiveWord" style={{ color: normalizeSubtitleHighlightColor(clip.subtitle?.highlightColor) }}>
              {text.text.slice(highlight.charStart, highlight.charEnd)}
            </span>
            {text.text.slice(highlight.charEnd)}
          </>
        )
      : text.text;
    return (
      <div className="previewSynthetic previewTextLayer" style={style}>
        <div style={{ background: text.backgroundColor ?? undefined }}>{highlightedText}</div>
        <VisualEffectOverlays clip={clip} time={time} />
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
          <VisualEffectOverlays clip={clip} time={time} />
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
    return (
      <div className="previewSynthetic previewGenerator" style={{ ...common, background }}>
        <VisualEffectOverlays clip={clip} time={time} />
      </div>
    );
  }

  return null;
}

function VisualEffectOverlays({ clip, time }: { clip: Clip; time: number }) {
  const localTime = clipLocalTime(clip, time);
  const washes = resolveTemperatureTintEffects(clip.effects ?? [], localTime);
  const vignettes = resolveVignetteEffects(clip.effects ?? [], localTime);
  if (washes.length === 0 && vignettes.length === 0) return null;
  return (
    <>
      {washes.map((wash, index) => (
        <i
          key={`wash-${wash.source}-${index}`}
          className="previewColorWashOverlay"
          style={{ background: wash.color, opacity: wash.alpha, mixBlendMode: wash.blendMode }}
          aria-hidden="true"
        />
      ))}
      {vignettes.map((vignette, index) => (
        <i
          key={`vignette-${index}`}
          className="previewVignetteOverlay"
          style={{ background: vignetteCssBackground(vignette) }}
          aria-hidden="true"
        />
      ))}
    </>
  );
}

function AudioLayer({ clip, asset, time, playing, trackMuted, trackGain, trackPan, fps }: { clip: Clip; asset?: AssetMeta; time: number; playing: boolean; trackMuted: boolean; trackGain: number; trackPan: number; fps: number }) {
  const ref = useRef<HTMLAudioElement>(null);
  const graphRef = useRef<PreviewAudioGraph | null>(null);
  const sourceTime = clipSourceTime(clip, time);
  const localTime = clipLocalTime(clip, time);
  const playbackRate = Math.max(0.0625, Math.min(16, clip.speed ?? 1));
  const syncTolerance = previewSyncTolerance(fps);

  useEffect(() => {
    const el = ref.current;
    if (!el || !asset?.objectUrl) return;
    let graph: PreviewAudioGraph | null = null;
    try {
      graph = new PreviewAudioGraph(el);
      graphRef.current = graph;
      graph.setEffects(clip.effects, localTime);
      graph.setTrackMix(trackGain, trackPan);
    } catch (error) {
      console.warn('Realtime audio effect preview is unavailable', error);
    }
    return () => {
      if (graphRef.current === graph) graphRef.current = null;
      graph?.detach();
    };
  }, [asset?.objectUrl]);

  useEffect(() => {
    graphRef.current?.setEffects(clip.effects, localTime);
  }, [clip.effects, localTime]);

  useEffect(() => {
    graphRef.current?.setTrackMix(trackGain, trackPan);
  }, [trackGain, trackPan]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.volume = Math.max(0, Math.min(1, clip.volume));
    el.muted = clip.muted || trackMuted || Boolean(clip.reverse);
    el.playbackRate = playbackRate;
    if (clip.reverse || !playing || Math.abs(el.currentTime - sourceTime) > syncTolerance) {
      el.currentTime = Math.max(0, sourceTime);
    }
  }, [clip.muted, clip.reverse, clip.volume, playbackRate, playing, sourceTime, syncTolerance, trackMuted]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (playing && !clip.reverse) {
      graphRef.current?.resume().catch(() => undefined);
      el.play().catch(() => undefined);
    } else {
      el.pause();
    }
  }, [clip.reverse, playing]);

  if (!asset?.objectUrl) return null;
  return <audio ref={ref} src={asset.objectUrl} preload="auto" />;
}

export function Preview({ project, time, playing, onTogglePlay, onTime }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const visuals = useMemo(() => visualTimelineItems(project, time), [project, time]);
  const audios = useMemo(() => audioTimelineItems(project, time), [project, time]);
  const requiresProcessedPreview = useMemo(
    () => visuals.some(({ clip }) => hasPixelEffects(clip.effects)),
    [visuals],
  );
  const aspect = `${project.width} / ${project.height}`;

  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === panelRef.current);
    document.addEventListener('fullscreenchange', sync);
    sync();
    return () => document.removeEventListener('fullscreenchange', sync);
  }, []);

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement === panelRef.current) await document.exitFullscreen();
      else await panelRef.current?.requestFullscreen();
    } catch (error) {
      console.warn('Fullscreen preview is unavailable', error);
    }
  };

  return (
    <section className="previewColumn">
      <div
        ref={panelRef}
        className="panel previewPanel"
        style={{ '--preview-aspect': project.width / Math.max(1, project.height) } as CSSProperties}
      >
        <div className="previewToolbar">
          <span>{project.width}×{project.height}</span>
          <span>{project.fps} fps</span>
          <PreviewAudioMeter playing={playing} />
          <PlaybackDiagnostics time={time} playing={playing} fps={project.fps} />
          <button className="miniBtn" type="button" onClick={toggleFullscreen} title={fullscreen ? 'フルスクリーンを終了' : 'フルスクリーン'} aria-label={fullscreen ? 'フルスクリーンを終了' : 'フルスクリーン'}>
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
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
            {visuals.length > 0 && (
              <>
                <PausedPreviewCanvas project={project} time={time} playing={playing} enabled={!playing} />
                <RealtimeProcessedPreviewCanvas
                  project={project}
                  time={time}
                  playing={playing}
                  enabled={playing && requiresProcessedPreview}
                />
              </>
            )}
            {visuals.length === 0 && <div className="stageEmpty"><FilmIcon /><span>タイムラインに素材を追加</span></div>}
          </div>
        </div>
        {audios.map(({ clip, track }) => (
          <AudioLayer
            key={clip.id}
            clip={clip}
            trackMuted={track.muted}
            trackGain={track.gain ?? 1}
            trackPan={track.pan ?? 0}
            asset={project.assets.find((asset) => asset.id === clip.assetId)}
            time={time}
            playing={playing}
            fps={project.fps}
          />
        ))}
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
