import type { Project, TimelineMarker } from '../types/editor';
import type { WaveformData } from '../render/waveform';

export interface BeatDetectionOptions {
  minPeak?: number;
  sensitivity?: number;
  minInterval?: number;
  windowSeconds?: number;
  maxCandidates?: number;
}

export interface BeatCandidate {
  time: number;
  peak: number;
  score: number;
}

export interface BeatDetectionResult {
  candidates: BeatCandidate[];
  estimatedBpm: number | null;
}

export const AUTO_BEAT_NOTE_PREFIX = 'auto-beat:';

export function detectBeatCandidates(
  waveform: Pick<WaveformData, 'duration' | 'peaks'>,
  options: BeatDetectionOptions = {},
): BeatDetectionResult {
  const duration = positive(waveform.duration);
  if (!duration || waveform.peaks.length < 3) return { candidates: [], estimatedBpm: null };

  const peaks = waveform.peaks.map((peak) => clamp(Number(peak) || 0, 0, 1));
  const binDuration = duration / peaks.length;
  const minPeak = clamp(options.minPeak ?? 0.08, 0, 1);
  const sensitivity = clamp(options.sensitivity ?? 1.55, 1.01, 10);
  const minInterval = clamp(options.minInterval ?? 0.22, binDuration, 5);
  const windowSeconds = clamp(options.windowSeconds ?? 0.65, binDuration * 2, 10);
  const maxCandidates = Math.max(1, Math.min(4000, Math.round(options.maxCandidates ?? 1000)));
  const windowBins = Math.max(2, Math.round(windowSeconds / binDuration));
  const prefix = new Float64Array(peaks.length + 1);

  for (let index = 0; index < peaks.length; index += 1) prefix[index + 1] = prefix[index] + peaks[index];

  const raw: BeatCandidate[] = [];
  for (let index = 1; index < peaks.length - 1; index += 1) {
    const peak = peaks[index];
    if (peak < minPeak || peak < peaks[index - 1] || peak < peaks[index + 1]) continue;

    const start = Math.max(0, index - windowBins);
    const count = Math.max(1, index - start);
    const baseline = (prefix[index] - prefix[start]) / count;
    const ratio = peak / Math.max(0.015, baseline);
    const prominence = peak - baseline;
    if (ratio < sensitivity || prominence < minPeak * 0.35) continue;

    raw.push({
      time: (index + 0.5) * binDuration,
      peak,
      score: ratio * 0.65 + prominence * 3 + peak * 0.35,
    });
  }

  raw.sort((a, b) => b.score - a.score || b.peak - a.peak || a.time - b.time);
  const selected: BeatCandidate[] = [];
  for (const candidate of raw) {
    if (selected.length >= maxCandidates) break;
    if (selected.some((accepted) => Math.abs(accepted.time - candidate.time) < minInterval)) continue;
    selected.push(candidate);
  }
  selected.sort((a, b) => a.time - b.time);

  return {
    candidates: selected,
    estimatedBpm: estimateBpm(selected),
  };
}

export function beatMarkersForAsset(
  project: Project,
  assetId: string,
  candidates: BeatCandidate[],
): TimelineMarker[] {
  if (!assetId || candidates.length === 0) return [];
  const markers: TimelineMarker[] = [];
  let serial = 0;

  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.assetId !== assetId) continue;
      const speed = Math.max(0.0001, positive(clip.speed ?? 1) ?? 1);
      const sourceMin = Math.max(0, clip.inPoint);
      const sourceMax = sourceMin + clip.duration * speed;

      for (const candidate of candidates) {
        if (candidate.time < sourceMin || candidate.time > sourceMax) continue;
        const local = clip.reverse
          ? clip.duration - (candidate.time - sourceMin) / speed
          : (candidate.time - sourceMin) / speed;
        const time = clip.start + clamp(local, 0, clip.duration);
        markers.push({
          id: `auto_beat_${assetId}_${clip.id}_${serial++}`,
          time,
          name: 'Beat',
          color: '#22d3ee',
          note: `${AUTO_BEAT_NOTE_PREFIX}${assetId}`,
        });
      }
    }
  }

  return markers.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

export function mergeBeatMarkers(
  existing: TimelineMarker[] | undefined,
  assetId: string,
  generated: TimelineMarker[],
) {
  const note = `${AUTO_BEAT_NOTE_PREFIX}${assetId}`;
  return [
    ...(existing ?? []).filter((marker) => marker.note !== note),
    ...generated,
  ].sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

export function estimateBpm(candidates: BeatCandidate[]) {
  if (candidates.length < 3) return null;
  const intervals: number[] = [];
  for (let index = 1; index < candidates.length; index += 1) {
    const interval = candidates[index].time - candidates[index - 1].time;
    if (interval >= 0.25 && interval <= 2) intervals.push(interval);
  }
  if (intervals.length < 2) return null;
  intervals.sort((a, b) => a - b);
  const middle = intervals.length >> 1;
  const median = intervals.length % 2
    ? intervals[middle]
    : (intervals[middle - 1] + intervals[middle]) / 2;
  let bpm = 60 / median;
  while (bpm < 60) bpm *= 2;
  while (bpm > 180) bpm /= 2;
  return Math.round(bpm * 10) / 10;
}

function positive(value: number) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
