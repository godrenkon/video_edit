import type { Project } from '../types/editor';

const MAX_SHUTTLE_RATE = 16;
const EDIT_EPSILON = 1e-7;

export function nextShuttleRate(currentRate: number, direction: -1 | 1) {
  const current = Number.isFinite(currentRate) ? currentRate : 0;
  if (current === 0 || Math.sign(current) !== direction) return direction;

  const magnitude = Math.min(MAX_SHUTTLE_RATE, Math.max(1, Math.abs(current) * 2));
  return direction * magnitude;
}

export function transportFrameTime(
  originSeconds: number,
  elapsedSeconds: number,
  fps: number,
  durationSeconds: number,
  playbackRate: number,
) {
  const frameRate = normalizedFps(fps);
  const duration = finiteClamp(durationSeconds, 0, Number.MAX_SAFE_INTEGER);
  const origin = quantizeTransportTime(originSeconds, frameRate, duration);
  const elapsed = Math.max(0, Number.isFinite(elapsedSeconds) ? elapsedSeconds : 0);
  const rate = Number.isFinite(playbackRate) ? playbackRate : 0;
  if (rate === 0) return origin;

  const raw = finiteClamp(origin + elapsed * rate, 0, duration);
  const scaled = raw * frameRate;
  const frameIndex = rate > 0
    ? Math.floor(scaled + EDIT_EPSILON)
    : Math.ceil(scaled - EDIT_EPSILON);
  return finiteClamp(frameIndex / frameRate, 0, duration);
}

export function quantizeTransportTime(timeSeconds: number, fps: number, durationSeconds = Number.MAX_SAFE_INTEGER) {
  const frameRate = normalizedFps(fps);
  const duration = finiteClamp(durationSeconds, 0, Number.MAX_SAFE_INTEGER);
  const safe = finiteClamp(timeSeconds, 0, duration);
  return finiteClamp(Math.round(safe * frameRate) / frameRate, 0, duration);
}

export function stepTransportFrames(
  timeSeconds: number,
  frames: number,
  fps: number,
  durationSeconds: number,
) {
  const frameRate = normalizedFps(fps);
  const currentFrame = Math.round(finiteClamp(timeSeconds, 0, durationSeconds) * frameRate);
  const lastFrame = Math.max(0, Math.round(Math.max(0, durationSeconds) * frameRate));
  const nextFrame = Math.max(0, Math.min(lastFrame, currentFrame + Math.trunc(frames)));
  return nextFrame / frameRate;
}

export function adjacentEditPoint(project: Project, timeSeconds: number, direction: -1 | 1) {
  const frame = 1 / normalizedFps(project.fps);
  const points = new Set<number>([0, Math.max(0, project.duration)]);
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      points.add(quantizeTransportTime(clip.start, project.fps, project.duration));
      points.add(quantizeTransportTime(clip.start + clip.duration, project.fps, project.duration));
    }
  }

  const sorted = [...points].sort((a, b) => a - b);
  if (direction > 0) {
    return sorted.find((point) => point > timeSeconds + frame / 2) ?? Math.max(0, project.duration);
  }

  for (let index = sorted.length - 1; index >= 0; index -= 1) {
    if (sorted[index] < timeSeconds - frame / 2) return sorted[index];
  }
  return 0;
}

function normalizedFps(fps: number) {
  return Math.max(1, Math.min(240, Math.round(Number.isFinite(fps) ? fps : 1)));
}

function finiteClamp(value: number, min: number, max: number) {
  const safe = Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, safe));
}
