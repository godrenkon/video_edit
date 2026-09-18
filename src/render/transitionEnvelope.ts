import type { Clip, ClipTransition, TransitionKind } from '../types/editor';

const TRANSITION_KINDS = new Set<TransitionKind>([
  'dissolve',
  'slide-left',
  'slide-right',
  'slide-up',
  'slide-down',
]);

export function transitionOpacity(clip: Pick<Clip, 'duration' | 'transitionIn' | 'transitionOut'>, clipLocalTime: number) {
  const duration = Math.max(0, finite(clip.duration, 0));
  const local = clamp(finite(clipLocalTime, 0), 0, duration);
  const inGain = transitionGainIn(clip.transitionIn, local, duration);
  const outGain = transitionGainOut(clip.transitionOut, local, duration);
  return clamp(Math.min(inGain, outGain), 0, 1);
}

export function transitionMotionOffset(
  clip: Pick<Clip, 'duration' | 'transitionIn' | 'transitionOut'>,
  clipLocalTime: number,
  frameWidth: number,
  frameHeight: number,
) {
  const duration = Math.max(0, finite(clip.duration, 0));
  const local = clamp(finite(clipLocalTime, 0), 0, duration);
  const width = Math.max(0, finite(frameWidth, 0));
  const height = Math.max(0, finite(frameHeight, 0));
  let x = 0;
  let y = 0;

  const transitionIn = normalizeTransition(clip.transitionIn, duration);
  if (transitionIn && transitionIn.kind !== 'dissolve' && local < transitionIn.duration) {
    const progress = clamp(local / transitionIn.duration, 0, 1);
    const distance = 1 - progress;
    const offset = motionForKind(transitionIn.kind, distance, width, height, 'in');
    x += offset.x;
    y += offset.y;
  }

  const transitionOut = normalizeTransition(clip.transitionOut, duration);
  if (transitionOut && transitionOut.kind !== 'dissolve') {
    const start = Math.max(0, duration - transitionOut.duration);
    if (local > start) {
      const progress = clamp((local - start) / transitionOut.duration, 0, 1);
      const offset = motionForKind(transitionOut.kind, progress, width, height, 'out');
      x += offset.x;
      y += offset.y;
    }
  }

  return { x, y };
}

export function normalizeTransition(transition: ClipTransition | undefined, clipDuration: number): ClipTransition | undefined {
  if (!transition || !isTransitionKind(transition.kind)) return undefined;
  const duration = clamp(finite(transition.duration, 0), 0, Math.max(0, clipDuration));
  return duration > 0 ? { kind: transition.kind, duration } : undefined;
}

export function isTransitionKind(value: unknown): value is TransitionKind {
  return typeof value === 'string' && TRANSITION_KINDS.has(value as TransitionKind);
}

function transitionGainIn(transition: ClipTransition | undefined, local: number, clipDuration: number) {
  const normalized = normalizeTransition(transition, clipDuration);
  if (!normalized || normalized.kind !== 'dissolve') return 1;
  return clamp(local / normalized.duration, 0, 1);
}

function transitionGainOut(transition: ClipTransition | undefined, local: number, clipDuration: number) {
  const normalized = normalizeTransition(transition, clipDuration);
  if (!normalized || normalized.kind !== 'dissolve') return 1;
  return clamp((clipDuration - local) / normalized.duration, 0, 1);
}

function motionForKind(
  kind: Exclude<TransitionKind, 'dissolve'>,
  amount: number,
  width: number,
  height: number,
  phase: 'in' | 'out',
) {
  const sign = phase === 'in' ? 1 : -1;
  if (kind === 'slide-left') return { x: sign * width * amount, y: 0 };
  if (kind === 'slide-right') return { x: -sign * width * amount, y: 0 };
  if (kind === 'slide-up') return { x: 0, y: sign * height * amount };
  return { x: 0, y: -sign * height * amount };
}

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
