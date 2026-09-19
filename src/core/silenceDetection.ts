import type { Project, TimelineMarker } from '../types/editor';
import type { WaveformData } from '../render/waveform';

export interface SilenceDetectionOptions {
  threshold?: number;
  minDuration?: number;
  mergeGap?: number;
}

export interface SilenceRange {
  start: number;
  end: number;
  duration: number;
  maxPeak: number;
}

export const AUTO_SILENCE_NOTE_PREFIX = 'auto-silence:';

export function detectSilenceRanges(
  waveform: Pick<WaveformData, 'duration' | 'peaks'>,
  options: SilenceDetectionOptions = {},
): SilenceRange[] {
  const duration = finitePositive(waveform.duration);
  if (!duration || waveform.peaks.length === 0) return [];

  const threshold = clamp(options.threshold ?? 0.018, 0, 1);
  const minDuration = clamp(options.minDuration ?? 0.45, 0.02, duration);
  const mergeGap = clamp(options.mergeGap ?? 0.08, 0, duration);
  const binDuration = duration / waveform.peaks.length;
  const raw: SilenceRange[] = [];
  let startIndex = -1;
  let maxPeak = 0;

  const close = (exclusiveEnd: number) => {
    if (startIndex < 0) return;
    const start = startIndex * binDuration;
    const end = Math.min(duration, exclusiveEnd * binDuration);
    if (end - start + Number.EPSILON >= minDuration) {
      raw.push({ start, end, duration: end - start, maxPeak });
    }
    startIndex = -1;
    maxPeak = 0;
  };

  for (let index = 0; index < waveform.peaks.length; index += 1) {
    const peak = clamp(Number(waveform.peaks[index]) || 0, 0, 1);
    if (peak <= threshold) {
      if (startIndex < 0) startIndex = index;
      maxPeak = Math.max(maxPeak, peak);
    } else {
      close(index);
    }
  }
  close(waveform.peaks.length);

  if (raw.length < 2 || mergeGap <= 0) return raw;
  const merged: SilenceRange[] = [{ ...raw[0] }];
  for (let index = 1; index < raw.length; index += 1) {
    const current = raw[index];
    const previous = merged[merged.length - 1];
    if (current.start - previous.end <= mergeGap + Number.EPSILON) {
      previous.end = current.end;
      previous.duration = previous.end - previous.start;
      previous.maxPeak = Math.max(previous.maxPeak, current.maxPeak);
    } else {
      merged.push({ ...current });
    }
  }
  return merged;
}

export function silenceMarkersForAsset(
  project: Project,
  assetId: string,
  ranges: SilenceRange[],
): TimelineMarker[] {
  if (!assetId || ranges.length === 0) return [];
  const markers: TimelineMarker[] = [];
  let serial = 0;

  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.assetId !== assetId) continue;
      const speed = Math.max(0.0001, finitePositive(clip.speed ?? 1) ?? 1);
      const sourceMin = Math.max(0, clip.inPoint);
      const sourceMax = sourceMin + clip.duration * speed;

      for (const range of ranges) {
        const sourceStart = Math.max(sourceMin, range.start);
        const sourceEnd = Math.min(sourceMax, range.end);
        if (sourceEnd <= sourceStart) continue;

        const localStart = clip.reverse
          ? clip.duration - (sourceEnd - sourceMin) / speed
          : (sourceStart - sourceMin) / speed;
        const localEnd = clip.reverse
          ? clip.duration - (sourceStart - sourceMin) / speed
          : (sourceEnd - sourceMin) / speed;
        const start = clip.start + clamp(localStart, 0, clip.duration);
        const end = clip.start + clamp(localEnd, 0, clip.duration);
        if (end <= start) continue;

        markers.push({
          id: `auto_silence_${assetId}_${clip.id}_${serial++}`,
          time: start,
          duration: end - start,
          name: `無音 ${formatSeconds(end - start)}`,
          color: '#64748b',
          note: `${AUTO_SILENCE_NOTE_PREFIX}${assetId}`,
        });
      }
    }
  }

  return markers.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

export function mergeSilenceMarkers(
  existing: TimelineMarker[] | undefined,
  assetId: string,
  generated: TimelineMarker[],
) {
  const note = `${AUTO_SILENCE_NOTE_PREFIX}${assetId}`;
  return [
    ...(existing ?? []).filter((marker) => marker.note !== note),
    ...generated,
  ].sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

function formatSeconds(value: number) {
  return `${Math.max(0, value).toFixed(value < 10 ? 2 : 1)}s`;
}

function finitePositive(value: number) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
