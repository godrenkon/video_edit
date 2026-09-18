import type { Clip } from '../types/editor';

export interface TimelineWindow {
  start: number;
  end: number;
}

export function timelineVisibleWindow(
  scrollLeft: number,
  viewportWidth: number,
  pixelsPerSecond: number,
  duration: number,
): TimelineWindow {
  const px = Math.max(1, finite(pixelsPerSecond, 1));
  const width = Math.max(0, finite(viewportWidth, 0));
  const scroll = Math.max(0, finite(scrollLeft, 0));
  const total = Math.max(0, finite(duration, 0));
  const overscanPx = Math.max(400, width);
  return {
    start: Math.max(0, (scroll - overscanPx) / px),
    end: Math.min(total, (scroll + width + overscanPx) / px),
  };
}

export function clipIntersectsTimelineWindow(
  clip: Pick<Clip, 'start' | 'duration'>,
  window: TimelineWindow,
) {
  const start = Math.max(0, finite(clip.start, 0));
  const end = start + Math.max(0, finite(clip.duration, 0));
  return end >= window.start && start <= window.end;
}

export function visibleSecondTicks(window: TimelineWindow, duration: number) {
  const total = Math.max(0, Math.floor(finite(duration, 0)));
  const first = Math.max(0, Math.floor(window.start));
  const last = Math.min(total, Math.ceil(window.end));
  const result: number[] = [];
  for (let tick = first; tick <= last; tick += 1) result.push(tick);
  return result;
}

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}
