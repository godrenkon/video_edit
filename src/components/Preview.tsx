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
  selectedClipId: string | null;
  onSelectClip: (clipId: string) => void;
  onClearSelection: () => void;
  onTransformClip: (clipId: string, patch: Partial<Clip['transform']>) => void;
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
  const generator = clip.kind === 'generator' ? clip.generator : undefined;
  const noiseSpeed = generator?.kind === 'noise'
    ? generatorNumber(generator, 'speed', 8, 0, 120)
    : 0;
  const noiseFrame = Math.floor(time * Math.min(24, noiseSpeed));
  const noiseBackground = useMemo(
    () => generator?.kind === 'noise' ? noiseDataUrl(clip.id, noiseFrame) : undefined,
    [clip.id, generator?.kind, noiseFrame],
  );
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

  if (clip.kind === 'generator' && generator) {
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
      background = noiseBackground;
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

export function Preview({
  project,
  time,
  playing,
  selectedClipId,
  onSelectClip,
  onClearSelection,
  onTransformClip,
  onTogglePlay,
  onTime,
}: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [showGuides, setShowGuides] = useState(true);
  const [snapGuides, setSnapGuides] = useState({ x: false, y: false });
  const [contextMenu, setContextMenu] = useState<{ clipId: string; x: number; y: number } | null>(null);
  const visuals = useMemo(() => visualTimelineItems(project, time), [project, time]);
  const audios = useMemo(() => audioTimelineItems(project, time), [project, time]);
  const selectedVisual = useMemo(
    () => visuals.find(({ clip }) => clip.id === selectedClipId) ?? null,
    [selectedClipId, visuals],
  );
  const requiresProcessedPreview = useMemo(
    () => visuals.some(({ clip }) => hasPixelEffects(clip.effects)),
    [visuals],
  );
  const aspect = `${project.width} / ${project.height}`;

  useEffect(() => {
    const closeContextMenu = () => setContextMenu(null);
    window.addEventListener('pointerdown', closeContextMenu);
    window.addEventListener('blur', closeContextMenu);
    window.addEventListener('resize', closeContextMenu);
    return () => {
      window.removeEventListener('pointerdown', closeContextMenu);
      window.removeEventListener('blur', closeContextMenu);
      window.removeEventListener('resize', closeContextMenu);
    };
  }, []);

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

  const beginMoveSelected = (event: React.PointerEvent<HTMLDivElement>) => {
    const selected = selectedVisual?.clip;
    const stage = stageRef.current;
    if (!selected || !stage || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onSelectClip(selected.id);
    const rect = stage.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const initialX = selected.transform.x;
    const initialY = selected.transform.y;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (pointer: PointerEvent) => {
      const dx = (pointer.clientX - startX) / Math.max(1, rect.width) * project.width;
      const dy = (pointer.clientY - startY) / Math.max(1, rect.height) * project.height;
      const rawX = initialX + dx;
      const rawY = initialY + dy;
      const thresholdX = project.width * 0.012;
      const thresholdY = project.height * 0.012;
      const snapX = Math.abs(rawX) <= thresholdX;
      const snapY = Math.abs(rawY) <= thresholdY;
      setSnapGuides({ x: snapX, y: snapY });
      onTransformClip(selected.id, { x: snapX ? 0 : rawX, y: snapY ? 0 : rawY });
    };
    const up = () => {
      setSnapGuides({ x: false, y: false });
      cleanupPreviewPointer(target, move, up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const beginRotateSelected = (event: React.PointerEvent<HTMLButtonElement>) => {
    const selected = selectedVisual?.clip;
    const stage = stageRef.current;
    if (!selected || !stage || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = stage.getBoundingClientRect();
    const centerX = rect.left + rect.width * (0.5 + selected.transform.x / Math.max(1, project.width));
    const centerY = rect.top + rect.height * (0.5 + selected.transform.y / Math.max(1, project.height));
    const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI;
    const initialRotation = selected.transform.rotation;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (pointer: PointerEvent) => {
      const angle = Math.atan2(pointer.clientY - centerY, pointer.clientX - centerX) * 180 / Math.PI;
      let rotation = initialRotation + angle - startAngle;
      if (pointer.shiftKey) rotation = Math.round(rotation / 15) * 15;
      onTransformClip(selected.id, { rotation });
    };
    const up = () => cleanupPreviewPointer(target, move, up);
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const beginScaleSelected = (event: React.PointerEvent<HTMLButtonElement>) => {
    const selected = selectedVisual?.clip;
    const stage = stageRef.current;
    if (!selected || !stage || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = stage.getBoundingClientRect();
    const startX = event.clientX;
    const startY = event.clientY;
    const initialScale = selected.transform.scale;
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (pointer: PointerEvent) => {
      const normalized = ((pointer.clientX - startX) / Math.max(1, rect.width) + (pointer.clientY - startY) / Math.max(1, rect.height)) * 0.9;
      onTransformClip(selected.id, { scale: Math.max(0.05, Math.min(12, initialScale * (1 + normalized))) });
    };
    const up = () => cleanupPreviewPointer(target, move, up);
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const selectionStyle = selectedVisual
    ? previewSelectionStyle(selectedVisual.clip, project, time, project.assets)
    : undefined;

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
          <button
            className={`miniBtn ${showGuides ? 'active' : ''}`}
            type="button"
            onClick={() => setShowGuides((value) => !value)}
            title={showGuides ? 'ガイドを非表示' : 'ガイドを表示'}
            aria-pressed={showGuides}
          ><span aria-hidden="true">#</span></button>
          <button className="miniBtn" type="button" onClick={toggleFullscreen} title={fullscreen ? 'フルスクリーンを終了' : 'フルスクリーン'} aria-label={fullscreen ? 'フルスクリーンを終了' : 'フルスクリーン'}>
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
        <div className="stageOuter">
          <div
            ref={stageRef}
            className="stage"
            style={{ aspectRatio: aspect, background: project.background }}
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) onClearSelection();
            }}
          >
            {showGuides && (
              <div className="previewGuides" aria-hidden="true">
                <i className="safeArea actionSafe" />
                <i className="safeArea titleSafe" />
                <i className="centerGuide vertical" />
                <i className="centerGuide horizontal" />
              </div>
            )}
            {snapGuides.x && <i className="previewSnapGuide vertical" aria-hidden="true" />}
            {snapGuides.y && <i className="previewSnapGuide horizontal" aria-hidden="true" />}
            {visuals.map(({ clip }) => {
              if (clip.kind === 'zundamon') return <ZundamonLayer key={clip.id} clip={clip} assets={project.assets} project={project} time={time} />;
              if (clip.kind === 'text' || clip.kind === 'subtitle' || clip.kind === 'generator') {
                return <SyntheticLayer key={clip.id} clip={clip} project={project} time={time} />;
              }
              return <VisualLayer key={clip.id} clip={clip} project={project} asset={project.assets.find((asset) => asset.id === clip.assetId)} time={time} playing={playing} />;
            })}
            {visuals.map(({ clip }) => {
              const hitStyle = previewSelectionStyle(clip, project, time, project.assets);
              return (
                <button
                  key={'hit-' + clip.id}
                  type="button"
                  className={'previewHitTarget ' + (clip.id === selectedClipId ? 'selected' : '')}
                  style={hitStyle}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation();
                    onSelectClip(clip.id);
                  }}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    onSelectClip(clip.id);
                    setContextMenu({
                      clipId: clip.id,
                      x: Math.max(8, Math.min(window.innerWidth - 230, event.clientX)),
                      y: Math.max(8, Math.min(window.innerHeight - 220, event.clientY)),
                    });
                  }}
                  aria-label={clip.name + 'を選択'}
                  title={clip.name}
                />
              );
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
            {selectedVisual && selectionStyle && (
              <div
                className="previewSelectionBox"
                style={selectionStyle}
                onPointerDown={beginMoveSelected}
                title="ドラッグで移動"
              >
                <button
                  type="button"
                  className="previewRotateHandle"
                  onPointerDown={beginRotateSelected}
                  aria-label="回転"
                  title="ドラッグで回転 / Shiftで15°スナップ"
                ><span aria-hidden="true">↻</span></button>
                <button
                  type="button"
                  className="previewScaleHandle"
                  onPointerDown={beginScaleSelected}
                  aria-label="拡大縮小"
                  title="ドラッグで拡大縮小"
                />
                <span className="previewSelectionLabel">{selectedVisual.clip.name}</span>
              </div>
            )}
            {visuals.length === 0 && <div className="stageEmpty"><FilmIcon /><span>タイムラインに素材を追加</span></div>}
          </div>
        </div>
        {contextMenu && (() => {
          const target = visuals.find(({ clip }) => clip.id === contextMenu.clipId)?.clip;
          if (!target) return null;
          return (
            <div
              className="editorContextMenu previewContextMenu"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onPointerDown={(event) => event.stopPropagation()}
              role="menu"
            >
              <button type="button" onClick={() => {
                onTransformClip(target.id, { x: 0, y: 0 });
                setContextMenu(null);
              }}>画面中央へ移動</button>
              <button type="button" onClick={() => {
                onTransformClip(target.id, { scale: 1 });
                setContextMenu(null);
              }}>拡大率を100%に戻す</button>
              <button type="button" onClick={() => {
                onTransformClip(target.id, {
                  x: 0,
                  y: 0,
                  scale: 1,
                  rotation: 0,
                  opacity: 1,
                  anchorX: 0.5,
                  anchorY: 0.5,
                });
                setContextMenu(null);
              }}>変形をリセット</button>
            </div>
          );
        })()}
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
          <button className="iconBtn" type="button" onClick={() => onTime(0)} aria-label="先頭へ移動" title="先頭へ移動"><SkipBack size={17} /></button>
          <button className="playBtn" type="button" onClick={onTogglePlay} aria-label={playing ? '一時停止' : '再生'} title={playing ? '一時停止' : '再生'}>{playing ? <Pause size={20} /> : <Play size={20} />}</button>
          <span className="timecode">{formatTime(time)}</span>
          <input type="range" min={0} max={project.duration} step={1 / project.fps} value={time} onChange={(e) => onTime(Number(e.target.value))} />
          <span className="timecode dim">{formatTime(project.duration)}</span>
          <Volume2 size={16} className="dim" />
        </div>
      </div>
    </section>
  );
}

function previewSelectionStyle(clip: Clip, project: Project, time: number, assets: AssetMeta[]): CSSProperties {
  const local = Math.max(0, Math.min(clip.duration, time - clip.start));
  const transitionOffset = transitionMotionOffset(clip, local, project.width, project.height);
  const xPercent = (clip.transform.x + transitionOffset.x) / Math.max(1, project.width) * 100;
  const yPercent = (clip.transform.y + transitionOffset.y) / Math.max(1, project.height) * 100;

  const assetId = clip.kind === 'zundamon'
    ? zundamonVisualState(clip, time).assetId
    : clip.assetId;
  const asset = assetId ? assets.find((item) => item.id === assetId) : undefined;
  if (asset && asset.kind !== 'audio') {
    const layout = previewCropLayout(
      asset.width ?? project.width,
      asset.height ?? project.height,
      project.width,
      project.height,
      clip.crop ?? null,
    );
    if (layout) {
      const anchorX = Math.max(0, Math.min(1, clip.transform.anchorX ?? 0.5));
      const anchorY = Math.max(0, Math.min(1, clip.transform.anchorY ?? 0.5));
      return {
        left: `${50 + xPercent}%`,
        top: `${50 + yPercent}%`,
        width: `${layout.frameWidthPercent}%`,
        height: `${layout.frameHeightPercent}%`,
        transformOrigin: '0 0',
        transform: `rotate(${clip.transform.rotation}deg) scale(${clip.transform.scale}) translate(${-anchorX * 100}%, ${-anchorY * 100}%)`,
      };
    }
  }

  if (clip.kind === 'generator') {
    return {
      left: `${xPercent}%`,
      top: `${yPercent}%`,
      width: '100%',
      height: '100%',
      transformOrigin: '50% 50%',
      transform: `scale(${clip.transform.scale}) rotate(${clip.transform.rotation}deg)`,
    };
  }

  return {
    left: `${50 + xPercent}%`,
    top: `${50 + yPercent}%`,
    width: '82%',
    height: clip.kind === 'subtitle' ? '22%' : '30%',
    transformOrigin: '50% 50%',
    transform: `translate(-50%, -50%) scale(${clip.transform.scale}) rotate(${clip.transform.rotation}deg)`,
  };
}

function cleanupPreviewPointer(
  target: HTMLElement,
  move: (event: PointerEvent) => void,
  up: () => void,
) {
  target.removeEventListener('pointermove', move);
  target.removeEventListener('pointerup', up);
  target.removeEventListener('pointercancel', up);
}

const NOISE_FRAME_CACHE_LIMIT = 96;
const noiseFrameCache = new Map<string, string | undefined>();

function noiseDataUrl(clipId: string, frame: number) {
  if (typeof document === 'undefined') return undefined;
  const key = `${clipId}:${frame}`;
  if (noiseFrameCache.has(key)) return noiseFrameCache.get(key);
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 18;
  const context = canvas.getContext('2d');
  if (!context) return undefined;
  const image = context.createImageData(canvas.width, canvas.height);
  const seed = hashString(key);
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
  const result = `url(${canvas.toDataURL('image/png')})`;
  noiseFrameCache.set(key, result);
  if (noiseFrameCache.size > NOISE_FRAME_CACHE_LIMIT) noiseFrameCache.delete(noiseFrameCache.keys().next().value!);
  return result;
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

function FilmIcon() {
  return <div className="emptyFilm">▣</div>;
}
