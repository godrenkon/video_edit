import { Copy, Eye, EyeOff, Lock, Scissors, Trash2, Unlock, ZoomIn, ZoomOut } from 'lucide-react';
import { useMemo } from 'react';
import type { Clip, Project } from '../types/editor';
import '../timeline-enhancements.css';

type TimelineEdge = 'left' | 'right';

interface Props {
  project: Project;
  time: number;
  zoom: number;
  selectedClipId: string | null;
  onZoom: (value: number) => void;
  onTime: (time: number) => void;
  onSelect: (clipId: string) => void;
  onSplitSelected: () => void;
  onDuplicateSelected: () => void;
  onRippleDeleteSelected: () => void;
  onMoveClip: (clipId: string, start: number) => void;
  onTrimClipLeft: (clipId: string, start: number) => void;
  onTrimClip: (clipId: string, duration: number) => void;
  onRippleTrimClip: (clipId: string, edge: TimelineEdge, boundary: number) => void;
  onRollEditClip: (clipId: string, edge: TimelineEdge, boundary: number) => void;
  onToggleMuteTrack: (trackId: string) => void;
  onToggleLockTrack: (trackId: string) => void;
}

export function Timeline(props: Props) {
  const {
    project,
    time,
    zoom,
    selectedClipId,
    onZoom,
    onTime,
    onSelect,
    onSplitSelected,
    onDuplicateSelected,
    onRippleDeleteSelected,
    onMoveClip,
    onTrimClipLeft,
    onTrimClip,
    onRippleTrimClip,
    onRollEditClip,
    onToggleMuteTrack,
    onToggleLockTrack,
  } = props;
  const px = zoom;
  const width = Math.max(1200, project.duration * px + 120);
  const ticks = useMemo(() => Array.from({ length: Math.ceil(project.duration) + 1 }, (_, i) => i), [project.duration]);
  const markers = useMemo(() => [...(project.markers ?? [])].sort((a, b) => a.time - b.time), [project.markers]);
  const hasExplicitRange = project.inPoint != null || project.outPoint != null;
  const rangeStart = Math.max(0, Math.min(project.duration, project.inPoint ?? 0));
  const rangeEnd = Math.max(rangeStart, Math.min(project.duration, project.outPoint ?? project.duration));

  const seekFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.clip')) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    onTime(Math.max(0, Math.min(project.duration, x / px)));
  };

  return (
    <section className="timelinePanel">
      <div className="timelineHeader">
        <div><strong>タイムライン</strong><span>{project.tracks.length} tracks</span></div>
        <div className="zoomCtl">
          <button
            className="miniBtn"
            onClick={onSplitSelected}
            disabled={!selectedClipId}
            title="再生ヘッドで分割 (Ctrl/Cmd+K)"
          ><Scissors size={14} /></button>
          <button
            className="miniBtn"
            onClick={onDuplicateSelected}
            disabled={!selectedClipId}
            title="選択クリップを複製 (Ctrl/Cmd+D)"
          ><Copy size={14} /></button>
          <button
            className="miniBtn"
            onClick={onRippleDeleteSelected}
            disabled={!selectedClipId}
            title="リップル削除 (Shift+Delete)"
          ><Trash2 size={14} /></button>
          <button className="miniBtn" onClick={() => onZoom(Math.max(20, zoom - 10))}><ZoomOut size={14} /></button>
          <input type="range" min={20} max={120} value={zoom} onChange={(e) => onZoom(Number(e.target.value))} />
          <button className="miniBtn" onClick={() => onZoom(Math.min(120, zoom + 10))}><ZoomIn size={14} /></button>
        </div>
      </div>
      <div className="timelineBody">
        <div className="trackNames">
          <div className="rulerSpacer" />
          {project.tracks.map((track) => (
            <div className="trackLabel" key={track.id}>
              <div><strong>{track.name}</strong><span>{track.kind}</span></div>
              <button className="miniBtn" onClick={() => onToggleMuteTrack(track.id)} title="ミュート">{track.muted ? <EyeOff size={13} /> : <Eye size={13} />}</button>
              <button className="miniBtn" onClick={() => onToggleLockTrack(track.id)} title="ロック">{track.locked ? <Lock size={13} /> : <Unlock size={13} />}</button>
            </div>
          ))}
        </div>
        <div className="timelineScroller">
          <div className="timelineCanvas" style={{ width }} onPointerDown={seekFromPointer}>
            <div className="ruler">
              {ticks.map((tick) => <div key={tick} className="tick" style={{ left: tick * px }}><span>{tick}s</span></div>)}
            </div>
            {hasExplicitRange && (
              <div
                className="exportRangeBand"
                style={{ left: rangeStart * px, width: Math.max(1, (rangeEnd - rangeStart) * px) }}
                title={`書き出し範囲 ${rangeStart.toFixed(2)}s - ${rangeEnd.toFixed(2)}s`}
              >
                <i className="rangeStartFlag">I</i>
                <i className="rangeEndFlag">O</i>
              </div>
            )}
            {markers.map((marker) => (
              <div
                className="timelineMarker"
                key={marker.id}
                style={{ left: Math.max(0, Math.min(project.duration, marker.time)) * px, '--marker-color': marker.color ?? '#ffc86b' } as React.CSSProperties}
                title={`${marker.name} / ${marker.time.toFixed(2)}s`}
              >
                <i />
                <span>{marker.name}</span>
              </div>
            ))}
            <div className="playhead" style={{ left: time * px }}><i /></div>
            {project.tracks.map((track) => (
              <div className="trackLane" key={track.id}>
                {track.clips.map((clip) => (
                  <TimelineClip
                    key={clip.id}
                    clip={clip}
                    px={px}
                    selected={selectedClipId === clip.id}
                    locked={track.locked}
                    onSelect={onSelect}
                    onMove={onMoveClip}
                    onTrimLeft={onTrimClipLeft}
                    onTrimRight={onTrimClip}
                    onRippleTrim={onRippleTrimClip}
                    onRollEdit={onRollEditClip}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function TimelineClip({
  clip,
  px,
  selected,
  locked,
  onSelect,
  onMove,
  onTrimLeft,
  onTrimRight,
  onRippleTrim,
  onRollEdit,
}: {
  clip: Clip;
  px: number;
  selected: boolean;
  locked: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, start: number) => void;
  onTrimLeft: (id: string, start: number) => void;
  onTrimRight: (id: string, duration: number) => void;
  onRippleTrim: (id: string, edge: TimelineEdge, boundary: number) => void;
  onRollEdit: (id: string, edge: TimelineEdge, boundary: number) => void;
}) {
  const drag = (e: React.PointerEvent) => {
    if (locked || (e.target as HTMLElement).closest('.trimHandle')) return;
    e.stopPropagation();
    onSelect(clip.id);
    const startX = e.clientX;
    const initial = clip.start;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => onMove(clip.id, Math.max(0, initial + (ev.clientX - startX) / px));
    const up = () => cleanupPointerDrag(target, move, up);
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const trimLeft = (e: React.PointerEvent) => {
    if (locked) return;
    e.stopPropagation();
    onSelect(clip.id);
    const mode = trimMode(e);
    const startX = e.clientX;
    const initialStart = clip.start;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const boundary = Math.max(0, initialStart + (ev.clientX - startX) / px);
      if (mode === 'roll') onRollEdit(clip.id, 'left', boundary);
      else if (mode === 'ripple') onRippleTrim(clip.id, 'left', boundary);
      else onTrimLeft(clip.id, boundary);
    };
    const up = () => cleanupPointerDrag(target, move, up);
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const trimRight = (e: React.PointerEvent) => {
    if (locked) return;
    e.stopPropagation();
    onSelect(clip.id);
    const mode = trimMode(e);
    const startX = e.clientX;
    const initialDuration = clip.duration;
    const initialBoundary = clip.start + clip.duration;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const deltaSeconds = (ev.clientX - startX) / px;
      const boundary = Math.max(clip.start + 0.1, initialBoundary + deltaSeconds);
      if (mode === 'roll') onRollEdit(clip.id, 'right', boundary);
      else if (mode === 'ripple') onRippleTrim(clip.id, 'right', boundary);
      else onTrimRight(clip.id, Math.max(0.1, initialDuration + deltaSeconds));
    };
    const up = () => cleanupPointerDrag(target, move, up);
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  return (
    <div
      className={`clip ${clip.kind} ${selected ? 'selected' : ''}`}
      style={{ left: clip.start * px, width: Math.max(12, clip.duration * px) }}
      onPointerDown={drag}
      onClick={(e) => { e.stopPropagation(); onSelect(clip.id); }}
      title={`${clip.name} / ${clip.duration.toFixed(2)}s`}
    >
      <div className="trimHandle left" onPointerDown={trimLeft} title="トリム / Shift: リップル / Alt: ロール" />
      <span>{clip.name}</span>
      <div className="trimHandle right" onPointerDown={trimRight} title="トリム / Shift: リップル / Alt: ロール" />
    </div>
  );
}

function trimMode(event: React.PointerEvent) {
  if (event.altKey) return 'roll' as const;
  if (event.shiftKey) return 'ripple' as const;
  return 'trim' as const;
}

function cleanupPointerDrag(target: HTMLElement, move: (event: PointerEvent) => void, up: () => void) {
  target.removeEventListener('pointermove', move);
  target.removeEventListener('pointerup', up);
  target.removeEventListener('pointercancel', up);
}
