export interface DecodeLatencySample {
  latencyMs: number;
  atMs: number;
}

export interface DecodeLatencySnapshot {
  count: number;
  lastMs: number;
  averageMs: number;
  p95Ms: number;
  maxMs: number;
}

const MAX_SAMPLES = 240;
const samples: DecodeLatencySample[] = [];

export function recordDecodeLatency(latencyMs: number, atMs = now()) {
  if (!Number.isFinite(latencyMs) || latencyMs < 0) return;
  samples.push({ latencyMs, atMs: Number.isFinite(atMs) ? atMs : now() });
  if (samples.length > MAX_SAMPLES) samples.splice(0, samples.length - MAX_SAMPLES);
}

export function readDecodeLatencySnapshot(atMs = now(), windowMs = 5_000): DecodeLatencySnapshot {
  const safeWindow = Math.max(100, Number.isFinite(windowMs) ? windowMs : 5_000);
  const threshold = atMs - safeWindow;
  prune(threshold);
  if (!samples.length) return emptySnapshot();

  const values = samples.map((sample) => sample.latencyMs);
  const sorted = [...values].sort((a, b) => a - b);
  const p95Index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1));
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    count: values.length,
    lastMs: values[values.length - 1],
    averageMs: total / values.length,
    p95Ms: sorted[p95Index],
    maxMs: sorted[sorted.length - 1],
  };
}

export function resetDecodeLatencyDiagnostics() {
  samples.length = 0;
}

function prune(threshold: number) {
  let remove = 0;
  while (remove < samples.length && samples[remove].atMs < threshold) remove += 1;
  if (remove > 0) samples.splice(0, remove);
}

function emptySnapshot(): DecodeLatencySnapshot {
  return { count: 0, lastMs: 0, averageMs: 0, p95Ms: 0, maxMs: 0 };
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
