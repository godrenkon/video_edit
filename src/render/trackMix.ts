export function normalizeTrackGain(value: number | undefined) {
  if (value === undefined) return 1;
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(4, value));
}

export function normalizeTrackPan(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

export function dbToLinear(db: number) {
  if (!Number.isFinite(db)) return 1;
  if (db <= -60) return 0;
  return Math.min(4, 10 ** (db / 20));
}

export function linearToDb(gain: number) {
  const safe = Math.max(0, Number.isFinite(gain) ? gain : 1);
  if (safe <= 1e-6) return -60;
  return Math.max(-60, Math.min(12, 20 * Math.log10(safe)));
}

export function applyTrackGainPan(left: number, right: number, gain: number | undefined, pan: number | undefined): [number, number] {
  const g = normalizeTrackGain(gain);
  const p = normalizeTrackPan(pan);
  const angle = (p + 1) * Math.PI / 4;
  const leftGain = Math.cos(angle) * Math.SQRT2;
  const rightGain = Math.sin(angle) * Math.SQRT2;
  return [left * g * leftGain, right * g * rightGain];
}
