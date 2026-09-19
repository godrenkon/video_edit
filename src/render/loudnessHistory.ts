import { loudnessFromMeanSquare } from './audioMeter';

const CALIBRATION_DB = -0.691;

export interface LoudnessHistoryPoint {
  timeMs: number;
  lufs: number;
}

export function meanSquareFromLoudness(lufs: number) {
  if (!Number.isFinite(lufs) || lufs <= -119.9) return 0;
  return 10 ** ((lufs - CALIBRATION_DB) / 10);
}

export function shortTermLoudness(
  points: LoudnessHistoryPoint[],
  nowMs: number,
  windowMs = 3000,
) {
  const minTime = nowMs - Math.max(100, windowMs);
  const active = points.filter((point) => point.timeMs >= minTime && point.timeMs <= nowMs);
  return loudnessAverage(active.map((point) => point.lufs));
}

export function integratedLoudness(
  blockLoudness: number[],
  absoluteGateLufs = -70,
  relativeGateLu = -10,
) {
  const absoluteGated = blockLoudness.filter(
    (value) => Number.isFinite(value) && value >= absoluteGateLufs,
  );
  if (absoluteGated.length === 0) return -120;

  const ungated = loudnessAverage(absoluteGated);
  if (ungated <= -119.9) return -120;
  const relativeThreshold = ungated + relativeGateLu;
  const threshold = Math.max(absoluteGateLufs, relativeThreshold);
  const relativeGated = absoluteGated.filter((value) => value >= threshold);
  return loudnessAverage(relativeGated);
}

export function loudnessAverage(values: number[]) {
  if (values.length === 0) return -120;
  let energy = 0;
  let count = 0;
  for (const value of values) {
    const meanSquare = meanSquareFromLoudness(value);
    if (meanSquare <= 0) continue;
    energy += meanSquare;
    count += 1;
  }
  return count > 0 ? loudnessFromMeanSquare(energy / count) : -120;
}

export function trimLoudnessHistory(
  points: LoudnessHistoryPoint[],
  nowMs: number,
  retainMs = 10 * 60 * 1000,
) {
  const minTime = nowMs - Math.max(3000, retainMs);
  return points.filter((point) => point.timeMs >= minTime);
}
