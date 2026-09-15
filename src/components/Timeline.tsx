import { Eye, EyeOff, Lock, Scissors, Trash2, Unlock, ZoomIn, ZoomOut } from 'lucide-react';
import { useMemo } from 'react';
import type { Clip, Project } from '../types/editor';

interface Props {
  project: Project;
  time: number;
  zoom: number;
  selectedClipId: string | null;
  onZoom: (value: number) => void;
  onTime: (time: number) => void;
  onSelect: (clipId: string) => void;
  onSplitSelected: () => void;
  onRippleDeleteSelected: () => void;
  onMoveClip: (clipId: string, start: number) => void;
  onTrimClip: (clipId: string, duration: number) => void;
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
    onRippleDeleteSelected,
    onMoveClip,
    onTrimClip,
    onToggleMuteTrack,
    onToggleLockTrack,
  } = props;
  const px = zoom;
  const width = Math.max(1200, project.duration * px + 120);
  const ticks = useMemo(() => Array.from({ length: Math.ceil(project.duration) + 1 }, (_, i) => i), [project.duration]);

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
                    onTrim={onTrimClip}
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

function TimelineClip({ clip, px, selected, locked, onSelect, onMove, onTrim }: {
  clip: Clip;
  px: number;
  selected: boolean;
  locked: boolean;
  onSelect: (id: string) => void;
  onMove: (id: string, start: number) => void;
  onTrim: (id: string, duration: number) => void;
}) {
  const drag = (e: React.PointerEvent) => {
    if (locked) return;
    e.stopPropagation();
    onSelect(clip.id);
    const startX = e.clientX;
    const initial = clip.start;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => onMove(clip.id, Math.max(0, initial + (ev.clientX - startX) / px));
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const trim = (e: React.PointerEvent) => {
    if (locked) return;
    e.stopPropagation();
    const startX = e.clientX;
    const initial = clip.duration;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => onTrim(clip.id, Math.max(0.1, initial + (ev.clientX - startX) / px));
    const up = () => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
    };
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
      <span>{clip.name}</span>
      <div className="trimHandle" onPointerDown={trim} />
    </div>
  );
}
