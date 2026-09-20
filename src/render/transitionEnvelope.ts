import type { Clip, ClipTransition, TransitionKind } from '../types/editor';

type SlideTransitionKind = Extract<TransitionKind, 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down'>;
type WipeTransitionKind = Extract<TransitionKind, 'wipe-left' | 'wipe-right' | 'wipe-up' | 'wipe-down'>;

export interface TransitionRevealRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

const FULL_REVEAL: TransitionRevealRect = { x: 0, y: 0, width: 1, height: 1 };
const TRANSITION_KINDS = new Set<TransitionKind>([
  'dissolve',
  'dip-black',
  'slide-left',
  'slide-right',
  'slide-up',
  'slide-down',
  'wipe-left',
  'wipe-right',
  'wipe-up',
  'wipe-down',
  'zoom-in',
  'zoom-out',
]);

export function transitionOpacity(clip: Pick<Clip, 'duration' | 'transitionIn' | 'transitionOut'>, clipLocalTime: number) {
  const duration = Math.max(0, finite(clip.duration, 0));
  const local = clamp(finite(clipLocalTime, 0), 0, duration);
  const inGain = transitionGainIn(clip.transitionIn, local, duration);
  const outGain = transitionGainOut(clip.transitionOut, local, duration);
  return clamp(Math.min(inGain, outGain), 0, 1);
}

export function transitionBrightness(
  clip: Pick<Clip, 'duration' | 'transitionIn' | 'transitionOut'>,
  clipLocalTime: number,
) {
  const duration = Math.max(0, finite(clip.duration, 0));
  const local = clamp(finite(clipLocalTime, 0), 0, duration);
  const inBrightness = dipBrightnessIn(clip.transitionIn, local, duration);
  const outBrightness = dipBrightnessOut(clip.transitionOut, local, duration);
  return clamp(Math.min(inBrightness, outBrightness), 0, 1);
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
  if (transitionIn && isSlideKind(transitionIn.kind) && local < transitionIn.duration) {
    const progress = clamp(local / transitionIn.duration, 0, 1);
    const distance = 1 - progress;
    const offset = motionForKind(transitionIn.kind, distance, width, height, 'in');
    x += offset.x;
    y += offset.y;
  }

  const transitionOut = normalizeTransition(clip.transitionOut, duration);
  if (transitionOut && isSlideKind(transitionOut.kind)) {
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

export function transitionScale(
  clip: Pick<Clip, 'duration' | 'transitionIn' | 'transitionOut'>,
  clipLocalTime: number,
) {
  const duration = Math.max(0, finite(clip.duration, 0));
  const local = clamp(finite(clipLocalTime, 0), 0, duration);
  let scale = 1;

  const transitionIn = normalizeTransition(clip.transitionIn, duration);
  if (transitionIn && isZoomKind(transitionIn.kind) && local < transitionIn.duration) {
    const progress = smoothstep(clamp(local / transitionIn.duration, 0, 1));
    const startScale = transitionIn.kind === 'zoom-in' ? 0.72 : 1.28;
    scale *= startScale + (1 - startScale) * progress;
  }

  const transitionOut = normalizeTransition(clip.transitionOut, duration);
  if (transitionOut && isZoomKind(transitionOut.kind)) {
    const start = Math.max(0, duration - transitionOut.duration);
    if (local > start) {
      const progress = smoothstep(clamp((local - start) / transitionOut.duration, 0, 1));
      const endScale = transitionOut.kind === 'zoom-in' ? 1.28 : 0.72;
      scale *= 1 + (endScale - 1) * progress;
    }
  }

  return clamp(scale, 0.05, 8);
}

export function transitionRevealRect(
  clip: Pick<Clip, 'duration' | 'transitionIn' | 'transitionOut'>,
  clipLocalTime: number,
): TransitionRevealRect {
  const duration = Math.max(0, finite(clip.duration, 0));
  const local = clamp(finite(clipLocalTime, 0), 0, duration);
  let reveal = { ...FULL_REVEAL };

  const transitionIn = normalizeTransition(clip.transitionIn, duration);
  if (transitionIn && isWipeKind(transitionIn.kind) && local < transitionIn.duration) {
    const visible = clamp(local / transitionIn.duration, 0, 1);
    reveal = intersectReveal(reveal, wipeRevealForKind(transitionIn.kind, visible, 'in'));
  }

  const transitionOut = normalizeTransition(clip.transitionOut, duration);
  if (transitionOut && isWipeKind(transitionOut.kind)) {
    const start = Math.max(0, duration - transitionOut.duration);
    if (local > start) {
      const visible = clamp((duration - local) / transitionOut.duration, 0, 1);
      reveal = intersectReveal(reveal, wipeRevealForKind(transitionOut.kind, visible, 'out'));
    }
  }

  return reveal;
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
  if (!normalized || (normalized.kind !== 'dissolve' && !isZoomKind(normalized.kind))) return 1;
  return clamp(local / normalized.duration, 0, 1);
}

function transitionGainOut(transition: ClipTransition | undefined, local: number, clipDuration: number) {
  const normalized = normalizeTransition(transition, clipDuration);
  if (!normalized || (normalized.kind !== 'dissolve' && !isZoomKind(normalized.kind))) return 1;
  return clamp((clipDuration - local) / normalized.duration, 0, 1);
}

function dipBrightnessIn(transition: ClipTransition | undefined, local: number, clipDuration: number) {
  const normalized = normalizeTransition(transition, clipDuration);
  if (!normalized || normalized.kind !== 'dip-black') return 1;
  return clamp(local / normalized.duration, 0, 1);
}

function dipBrightnessOut(transition: ClipTransition | undefined, local: number, clipDuration: number) {
  const normalized = normalizeTransition(transition, clipDuration);
  if (!normalized || normalized.kind !== 'dip-black') return 1;
  return clamp((clipDuration - local) / normalized.duration, 0, 1);
}

function motionForKind(
  kind: SlideTransitionKind,
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

function wipeRevealForKind(
  kind: WipeTransitionKind,
  visibleAmount: number,
  phase: 'in' | 'out',
): TransitionRevealRect {
  const visible = clamp(visibleAmount, 0, 1);
  if (kind === 'wipe-left') {
    return phase === 'in'
      ? { x: 1 - visible, y: 0, width: visible, height: 1 }
      : { x: 0, y: 0, width: visible, height: 1 };
  }
  if (kind === 'wipe-right') {
    return phase === 'in'
      ? { x: 0, y: 0, width: visible, height: 1 }
      : { x: 1 - visible, y: 0, width: visible, height: 1 };
  }
  if (kind === 'wipe-up') {
    return phase === 'in'
      ? { x: 0, y: 1 - visible, width: 1, height: visible }
      : { x: 0, y: 0, width: 1, height: visible };
  }
  return phase === 'in'
    ? { x: 0, y: 0, width: 1, height: visible }
    : { x: 0, y: 1 - visible, width: 1, height: visible };
}

function intersectReveal(a: TransitionRevealRect, b: TransitionRevealRect): TransitionRevealRect {
  const left = Math.max(a.x, b.x);
  const top = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);
  return {
    x: clamp(left, 0, 1),
    y: clamp(top, 0, 1),
    width: clamp(right - left, 0, 1),
    height: clamp(bottom - top, 0, 1),
  };
}

function isSlideKind(kind: TransitionKind): kind is SlideTransitionKind {
  return kind.startsWith('slide-');
}

function isWipeKind(kind: TransitionKind): kind is WipeTransitionKind {
  return kind.startsWith('wipe-');
}

function isZoomKind(kind: TransitionKind): kind is Extract<TransitionKind, 'zoom-in' | 'zoom-out'> {
  return kind === 'zoom-in' || kind === 'zoom-out';
}

function smoothstep(value: number) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
