import type { Clip, ClipTransition } from '../types/editor';

export function transitionOpacity(clip: Pick<Clip, 'duration' | 'transitionIn' | 'transitionOut'>, clipLocalTime: number) {
  const duration = Math.max(0, finite(clip.duration, 0));
  const local = Math.max(0, Math.min(duration, finite(clipLocalTime, 0)));
  const inGain = transitionGainIn(clip.transitionIn, local, duration);
  const outGain = transitionGainOut(clip.transitionOut, local, duration);
  return Math.max(0, Math.min(1, Math.min(inGain, outGain)));
}

export function normalizeTransition(transition: ClipTransition | undefined, clipDuration: number) {
  if (!transition || transition.kind !== 'dissolve') return undefined;
  const duration = Math.max(0, Math.min(Math.max(0, clipDuration), finite(transition.duration, 0)));
  return duration > 0 ? { kind: 'dissolve' as const, duration } : undefined;
}

function transitionGainIn(transition: ClipTransition | undefined, local: number, clipDuration: number) {
  const normalized = normalizeTransition(transition, clipDuration);
  if (!normalized) return 1;
  return Math.min(1, local / normalized.duration);
}

function transitionGainOut(transition: ClipTransition | undefined, local: number, clipDuration: number) {
  const normalized = normalizeTransition(transition, clipDuration);
  if (!normalized) return 1;
  return Math.min(1, Math.max(0, clipDuration - local) / normalized.duration);
}

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}
