export const DEFAULT_CAPTURE_COUNTDOWN_SECONDS = 3;

export type CaptureCountdownTick = number | null;

export async function runCaptureCountdown(
  onTick: (remaining: CaptureCountdownTick) => void,
  signal?: AbortSignal,
  seconds = DEFAULT_CAPTURE_COUNTDOWN_SECONDS,
  sleep: (milliseconds: number) => Promise<void> = delay,
) {
  const total = normalizeCountdownSeconds(seconds);
  try {
    for (let remaining = total; remaining >= 1; remaining -= 1) {
      if (signal?.aborted) return false;
      onTick(remaining);
      await sleep(1_000);
    }
    if (signal?.aborted) return false;
    onTick(null);
    return true;
  } finally {
    if (signal?.aborted) onTick(null);
  }
}

export function normalizeCountdownSeconds(value: number) {
  if (!Number.isFinite(value)) return DEFAULT_CAPTURE_COUNTDOWN_SECONDS;
  return Math.max(0, Math.min(10, Math.round(value)));
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}
