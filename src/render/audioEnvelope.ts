export interface ClipFadeEnvelope {
  duration: number;
  fadeIn?: number;
  fadeOut?: number;
}

/**
 * Returns a deterministic linear gain envelope for one clip-local timestamp.
 * Fade durations are independently clamped to the clip length, so overlapping
 * fades on short clips combine smoothly instead of producing invalid gains.
 */
export function clipFadeGain(envelope: ClipFadeEnvelope, localTimeSeconds: number) {
  const duration = Math.max(0, finite(envelope.duration, 0));
  if (duration <= 0) return 0;

  const time = clamp(finite(localTimeSeconds, 0), 0, duration);
  const fadeIn = clamp(finite(envelope.fadeIn ?? 0, 0), 0, duration);
  const fadeOut = clamp(finite(envelope.fadeOut ?? 0, 0), 0, duration);

  const inGain = fadeIn > 0 ? clamp(time / fadeIn, 0, 1) : 1;
  const outGain = fadeOut > 0 ? clamp((duration - time) / fadeOut, 0, 1) : 1;
  return clamp(inGain * outGain, 0, 1);
}

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
