import { ClipboardCopy, ClipboardPaste, Copy, Eye, EyeOff, Link2, Lock, Scissors, Trash2, Unlink2, Unlock, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AssetMeta, Clip, Project } from '../types/editor';
import { clipIntersectsTimelineWindow, timelineVisibleWindow, visibleSecondTicks } from '../core/timelineVirtualization';
import { TimelineWaveform } from './TimelineWaveform';
import { TimelineThumbnailStrip } from './TimelineThumbnailStrip';
import '../timeline-enhancements.css';

type TimelineEdge = 'left' | 'right';

interface Props {
  project: Project;
  time: number;
  zoom: number;
  selectedClipId: string | null;
  selectedClipIds: string[];
  snappingEnabled: boolean;
  onToggleSnapping: () => void;
  onZoom: (value: number) => void;
  onTime: (time: number) => void;
  onSelect: (clipId: string, additive: boolean) => void;
  onClearSelection: () => void;
  onMoveSelectedByDelta: (deltaSeconds: number) => void;
  onSplitSelected: () => void;
  onDeleteSelected: () => void;
  onDuplicateSelected: () => void;
  onCopySelected: () => void;
  onPasteCopied: () => void;
  onRippleDeleteSelected: () => void;
  onGroupSelected: () => void;
  onUngroupSelected: () => void;
  canGroup: boolean;
  canUngroup: boolean;
  onMoveClip: (clipId: string, start: number) => void;
  onMoveClipToTrack: (clipId: string, trackId: string, start: number) => void;
  onSlideClip: (clipId: string, start: number) => void;
  onTrimClipLeft: (clipId: string, start: number) => void;
  onTrimClip: (clipId: string, duration: number) => void;
  onRippleTrimClip: (clipId: string, edge: TimelineEdge, boundary: number) => void;
  onRollEditClip: (clipId: string, edge: TimelineEdge, boundary: number) => void;
  onToggleMuteTrack: (trackId: string) => void;
  onToggleSoloTrack: (trackId: string) => void;
  onToggleVisibleTrack: (trackId: string) => void;
  onToggleTargetTrack: (trackId: string) => void;
  onToggleSyncLockTrack: (trackId: string) => void;
  onToggleLockTrack: (trackId: string) => void;
}

export function Timeline(props: Props) {
  const {
    project,
    time,
    zoom,
    selectedClipId,
    selectedClipIds,
    snappingEnabled,
    onToggleSnapping,
    onZoom,
    onTime,
    onSelect,
    onClearSelection,
    onMoveSelectedByDelta,
    onSplitSelected,
    onDeleteSelected,
    onDuplicateSelected,
    onCopySelected,
    onPasteCopied,
    onRippleDeleteSelected,
    onGroupSelected,
    onUngroupSelected,
    canGroup,
    canUngroup,
    onMoveClip,
    onMoveClipToTrack,
    onSlideClip,
    onTrimClipLeft,
    onTrimClip,
    onRippleTrimClip,
    onRollEditClip,
    onToggleMuteTrack,
    onToggleSoloTrack,
    onToggleVisibleTrack,
    onToggleTargetTrack,
    onToggleSyncLockTrack,
    onToggleLockTrack,
  } = props;
  const px = zoom;
  const width = Math.max(1200, project.duration * px + 120);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ scrollLeft: 0, width: 0 });
  const [contextMenu, setContextMenu] = useState<{ clipId: string; x: number; y: number } | null>(null);
  const [trackHeights, setTrackHeights] = useState<Record<string, number>>(() => {
    try {
      const raw = localStorage.getItem('suiram.timeline.trackHeights');
      return raw ? JSON.parse(raw) as Record<string, number> : {};
    } catch {
      return {};
    }
  });
  const visibleWindow = useMemo(
    () => timelineVisibleWindow(viewport.scrollLeft, viewport.width, px, project.duration),
    [project.duration, px, viewport.scrollLeft, viewport.width],
  );
  const ticks = useMemo(() => visibleSecondTicks(visibleWindow, project.duration), [project.duration, visibleWindow]);
  const markers = useMemo(() => [...(project.markers ?? [])].sort((a, b) => a.time - b.time), [project.markers]);
  const assetById = useMemo(() => new Map(project.assets.map((asset) => [asset.id, asset])), [project.assets]);
  const hasExplicitRange = project.inPoint != null || project.outPoint != null;
  const rangeStart = Math.max(0, Math.min(project.duration, project.inPoint ?? 0));
  const rangeEnd = Math.max(rangeStart, Math.min(project.duration, project.outPoint ?? project.duration));
  const trackHeight = (trackId: string) => Math.max(38, Math.min(160, trackHeights[trackId] ?? 54));

  useEffect(() => {
    try {
      localStorage.setItem('suiram.timeline.trackHeights', JSON.stringify(trackHeights));
    } catch {
      // Workspace sizing is best-effort and must never block editing.
    }
  }, [trackHeights]);

  const beginTrackHeightResize = (event: React.PointerEvent<HTMLDivElement>, trackId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const startY = event.clientY;
    const initial = trackHeight(trackId);
    const target = event.currentTarget;
    target.setPointerCapture(event.pointerId);
    const move = (pointer: PointerEvent) => {
      const next = Math.max(38, Math.min(160, initial + pointer.clientY - startY));
      setTrackHeights((current) => ({ ...current, [trackId]: Math.round(next) }));
    };
    const up = () => cleanupPointerDrag(target, move, up);
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const trackAtPointerY = (clientY: number, fallbackTrackId: string) => {
    const lanes = Array.from(document.querySelectorAll<HTMLElement>('.trackLane[data-track-id]'));
    const lane = lanes.find((element) => {
      const rect = element.getBoundingClientRect();
      return clientY >= rect.top && clientY <= rect.bottom;
    });
    return lane?.dataset.trackId ?? fallbackTrackId;
  };

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, []);

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const update = () => setViewport({ scrollLeft: element.scrollLeft, width: element.clientWidth });
    update();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null;
    observer?.observe(element);
    window.addEventListener('resize', update);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', update);
    };
  }, []);

  const seekFromPointer = (e: React.PointerEvent<HTMLDivElement>) => {
    if ((e.target as HTMLElement).closest('.clip')) return;
    onClearSelection();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    onTime(Math.max(0, Math.min(project.duration, x / px)));
  };

  return (
    <section className="timelinePanel">
      <div className="timelineHeader">
        <div><strong>タイムライン</strong><span>{project.tracks.length} tracks · {selectedClipIds.length} selected</span></div>
        <div className="zoomCtl">
          <button
            className="miniBtn"
            onClick={onSplitSelected}
            disabled={!selectedClipId}
            title="再生ヘッドで分割 (Ctrl/Cmd+K)"
          ><Scissors size={14} /></button>
          <button
            className="miniBtn"
            onClick={onDeleteSelected}
            disabled={!selectedClipId}
            title="リフト: クリップを削除して隙間を残す (Delete)"
          ><X size={14} /></button>
          <button
            className="miniBtn"
            onClick={onDuplicateSelected}
            disabled={!selectedClipId}
            title="選択クリップを複製 (Ctrl/Cmd+D)"
          ><Copy size={14} /></button>
          <button
            className="miniBtn"
            onClick={onCopySelected}
            disabled={!selectedClipId}
            title="選択クリップをコピー (Ctrl/Cmd+C)"
          ><ClipboardCopy size={14} /></button>
          <button
            className="miniBtn"
            onClick={onPasteCopied}
            title="コピーしたクリップを再生ヘッド位置へ貼り付け (Ctrl/Cmd+V)"
          ><ClipboardPaste size={14} /></button>
          <button
            className="miniBtn"
            onClick={onRippleDeleteSelected}
            disabled={!selectedClipId}
            title="抽出: クリップを削除して後続を詰める (Shift+Delete)"
          ><Trash2 size={14} /></button>
          <button className="miniBtn" onClick={onGroupSelected} disabled={!canGroup} title="選択クリップをグループ化 (Ctrl/Cmd+G)"><Link2 size={14} /></button>
          <button className="miniBtn" onClick={onUngroupSelected} disabled={!canUngroup} title="選択グループを解除 (Ctrl/Cmd+Shift+G)"><Unlink2 size={14} /></button>
          <button
            className={`miniBtn ${snappingEnabled ? 'active' : ''}`}
            onClick={onToggleSnapping}
            title={snappingEnabled ? 'スナップを無効化' : 'スナップを有効化'}
            aria-pressed={snappingEnabled}
          ><span aria-hidden="true">SN</span></button>
          <button className="miniBtn" onClick={() => onZoom(Math.max(20, zoom - 10))}><ZoomOut size={14} /></button>
          <input type="range" min={20} max={120} value={zoom} onChange={(e) => onZoom(Number(e.target.value))} />
          <button className="miniBtn" onClick={() => onZoom(Math.min(120, zoom + 10))}><ZoomIn size={14} /></button>
        </div>
      </div>
      <div className="timelineBody">
        <div className="trackNames">
          <div className="rulerSpacer" />
          {project.tracks.map((track) => (
            <div className="trackLabel" key={track.id} style={{ height: trackHeight(track.id) }}>
              <div><strong>{track.name}</strong><span>{track.kind}</span></div>
              <button className={`miniBtn ${track.muted ? 'active' : ''}`} onClick={() => onToggleMuteTrack(track.id)} title={track.muted ? 'ミュート解除' : 'ミュート'} aria-pressed={track.muted}>M</button>
              <button className={`miniBtn ${track.solo ? 'active' : ''}`} onClick={() => onToggleSoloTrack(track.id)} title="Solo" aria-pressed={Boolean(track.solo)}>S</button>
              {track.kind !== 'audio' && <button className={`miniBtn ${track.visible === false ? '' : 'active'}`} onClick={() => onToggleVisibleTrack(track.id)} title={track.visible === false ? '表示' : '非表示'}>{track.visible === false ? <EyeOff size={13} /> : <Eye size={13} />}</button>}
              <button
                className={`miniBtn ${track.targeted ? 'active' : ''}`}
                onClick={() => onToggleTargetTrack(track.id)}
                title={track.targeted ? 'ターゲット解除' : '編集ターゲットに指定'}
                aria-pressed={Boolean(track.targeted)}
              >T</button>
              <button
                className={`miniBtn ${track.syncLock === false ? '' : 'active'}`}
                onClick={() => onToggleSyncLockTrack(track.id)}
                title={track.syncLock === false ? '同期ロックを有効化' : '同期ロックを解除'}
                aria-pressed={track.syncLock !== false}
              >SL</button>
              <button className="miniBtn" onClick={() => onToggleLockTrack(track.id)} title={track.locked ? 'ロック解除' : 'ロック'}>{track.locked ? <Lock size={13} /> : <Unlock size={13} />}</button>
              <div className="trackHeightHandle" onPointerDown={(event) => beginTrackHeightResize(event, track.id)} title="ドラッグでトラックの高さを変更" />
            </div>
          ))}
        </div>
        <div className="timelineScroller" ref={scrollerRef} onScroll={(event) => setViewport({ scrollLeft: event.currentTarget.scrollLeft, width: event.currentTarget.clientWidth })}>
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
            {markers.filter((marker) => marker.time >= visibleWindow.start && marker.time <= visibleWindow.end).map((marker) => (
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
              <div className="trackLane" key={track.id} data-track-id={track.id} style={{ height: trackHeight(track.id) }}>
                {track.clips.filter((clip) => selectedClipIds.includes(clip.id) || clipIntersectsTimelineWindow(clip, visibleWindow)).map((clip) => (
                  <TimelineClip
                    key={clip.id}
                    clip={clip}
                    trackId={track.id}
                    asset={clip.assetId ? assetById.get(clip.assetId) : undefined}
                    px={px}
                    selected={selectedClipIds.includes(clip.id)}
                    multiSelected={selectedClipIds.length > 1}
                    locked={track.locked}
                    onSelect={onSelect}
                    onMove={onMoveClip}
                    onMoveToTrack={(id, start, clientY, sourceTrackId) => {
                      const targetTrackId = trackAtPointerY(clientY, sourceTrackId);
                      if (targetTrackId === sourceTrackId) onMoveClip(id, start);
                      else onMoveClipToTrack(id, targetTrackId, start);
                    }}
                    onMoveSelectedByDelta={onMoveSelectedByDelta}
                    onSlide={onSlideClip}
                    onTrimLeft={onTrimClipLeft}
                    onTrimRight={onTrimClip}
                    onRippleTrim={onRippleTrimClip}
                    onRollEdit={onRollEditClip}
                    onContextMenu={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (!selectedClipIds.includes(clip.id)) onSelect(clip.id, false);
                      setContextMenu({
                        clipId: clip.id,
                        x: Math.max(8, Math.min(window.innerWidth - 238, event.clientX)),
                        y: Math.max(8, Math.min(window.innerHeight - 330, event.clientY)),
                      });
                    }}
                  />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
      {contextMenu && (
        <div
          className="editorContextMenu timelineContextMenu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          role="menu"
        >
          <button type="button" onClick={() => { onSplitSelected(); setContextMenu(null); }}><Scissors size={14} />再生ヘッドで分割</button>
          <button type="button" onClick={() => { onDuplicateSelected(); setContextMenu(null); }}><Copy size={14} />複製</button>
          <button type="button" onClick={() => { onCopySelected(); setContextMenu(null); }}><ClipboardCopy size={14} />コピー</button>
          <button type="button" onClick={() => { onPasteCopied(); setContextMenu(null); }}><ClipboardPaste size={14} />再生ヘッドへ貼り付け</button>
          <hr />
          <button type="button" disabled={!canGroup} onClick={() => { onGroupSelected(); setContextMenu(null); }}><Link2 size={14} />グループ化</button>
          <button type="button" disabled={!canUngroup} onClick={() => { onUngroupSelected(); setContextMenu(null); }}><Unlink2 size={14} />グループ解除</button>
          <hr />
          <button type="button" className="danger" onClick={() => { onDeleteSelected(); setContextMenu(null); }}><X size={14} />削除（隙間を残す）</button>
          <button type="button" className="danger" onClick={() => { onRippleDeleteSelected(); setContextMenu(null); }}><Trash2 size={14} />リップル削除</button>
        </div>
      )}
    </section>
  );
}

function TimelineClip({
  clip,
  trackId,
  asset,
  px,
  selected,
  multiSelected,
  locked,
  onSelect,
  onMove,
  onMoveToTrack,
  onMoveSelectedByDelta,
  onSlide,
  onTrimLeft,
  onTrimRight,
  onRippleTrim,
  onRollEdit,
  onContextMenu,
}: {
  clip: Clip;
  trackId: string;
  asset?: AssetMeta;
  px: number;
  selected: boolean;
  multiSelected: boolean;
  locked: boolean;
  onSelect: (id: string, additive: boolean) => void;
  onMove: (id: string, start: number) => void;
  onMoveToTrack: (id: string, start: number, clientY: number, sourceTrackId: string) => void;
  onMoveSelectedByDelta: (deltaSeconds: number) => void;
  onSlide: (id: string, start: number) => void;
  onTrimLeft: (id: string, start: number) => void;
  onTrimRight: (id: string, duration: number) => void;
  onRippleTrim: (id: string, edge: TimelineEdge, boundary: number) => void;
  onRollEdit: (id: string, edge: TimelineEdge, boundary: number) => void;
  onContextMenu: (event: React.MouseEvent<HTMLDivElement>) => void;
}) {
  const drag = (e: React.PointerEvent) => {
    if (locked || (e.target as HTMLElement).closest('.trimHandle')) return;
    e.stopPropagation();
    const additive = e.ctrlKey || e.metaKey;
    if (additive) {
      onSelect(clip.id, true);
      return;
    }
    if (!selected) onSelect(clip.id, false);
    const startX = e.clientX;
    let lastX = startX;
    let finalStart = clip.start;
    const initial = clip.start;
    const slide = e.altKey && !multiSelected;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      if (multiSelected && selected) {
        const delta = (ev.clientX - lastX) / px;
        lastX = ev.clientX;
        onMoveSelectedByDelta(delta);
        return;
      }
      finalStart = Math.max(0, initial + (ev.clientX - startX) / px);
      if (slide) onSlide(clip.id, finalStart);
      else onMove(clip.id, finalStart);
    };
    const up = (ev?: PointerEvent) => {
      if (ev?.type === 'pointerup' && !slide && !(multiSelected && selected)) {
        onMoveToTrack(clip.id, finalStart, ev.clientY, trackId);
      }
      cleanupPointerDrag(target, move, up);
    };
    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  };

  const trimLeft = (e: React.PointerEvent) => {
    if (locked) return;
    e.stopPropagation();
    onSelect(clip.id, false);
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
    onSelect(clip.id, false);
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
      className={`clip ${clip.kind} ${clip.groupId ? 'grouped' : ''} ${selected ? 'selected' : ''}`}
      style={{ left: clip.start * px, width: Math.max(12, clip.duration * px) }}
      onPointerDown={drag}
      onContextMenu={onContextMenu}
      onClick={(e) => {
        e.stopPropagation();
        if (e.ctrlKey || e.metaKey) return;
        onSelect(clip.id, false);
      }}
      title={`${clip.name} / ${clip.duration.toFixed(2)}s / Ctrl/Cmd+クリック: 複数選択 / Alt+ドラッグ: スライド編集`}
    >
      <div className="trimHandle left" onPointerDown={trimLeft} title="トリム / Shift: リップル / Alt: ロール" />
      <TimelineThumbnailStrip asset={asset} clip={clip} pixelsPerSecond={px} />
      <TimelineWaveform asset={asset} clip={clip} />
      {clip.transitionIn && <i className="transitionBand in" style={{ width: Math.min(clip.duration, clip.transitionIn.duration) * px }} />}
      {clip.transitionOut && <i className="transitionBand out" style={{ width: Math.min(clip.duration, clip.transitionOut.duration) * px }} />}
      <span>{clip.groupId ? '⛓ ' : ''}{clip.name}</span>
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
