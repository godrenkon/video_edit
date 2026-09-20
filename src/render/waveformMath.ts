export interface WaveformData {
  version: 1;
  fingerprint: string;
  duration: number;
  samplesPerSecond: number;
  peaks: number[];
}

export function waveformBinCount(duration: number, samplesPerSecond = 48, maxBins = 12_000) {
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  const rate = Math.max(4, Math.min(240, Math.round(samplesPerSecond)));
  return Math.max(1, Math.min(Math.max(64, Math.round(maxBins)), Math.ceil(duration * rate)));
}

export function accumulateWaveformPeaks(
  peaks: Float32Array,
  duration: number,
  channels: Float32Array[],
  sampleRate: number,
  bufferTimestamp: number,
  rangeStart = 0,
  rangeEnd = duration,
) {
  if (peaks.length === 0 || channels.length === 0 || !Number.isFinite(duration) || duration <= 0 || sampleRate <= 0) return;
  const frameCount = Math.min(...channels.map((channel) => channel.length));
  const safeStart = Math.max(0, rangeStart);
  const safeEnd = Math.min(duration, Math.max(safeStart, rangeEnd));

  for (let frame = 0; frame < frameCount; frame += 1) {
    const time = bufferTimestamp + frame / sampleRate;
    if (time < safeStart || time >= safeEnd || time < 0 || time >= duration) continue;
    let peak = 0;
    for (const channel of channels) peak = Math.max(peak, Math.abs(channel[frame] ?? 0));
    const index = Math.min(peaks.length - 1, Math.floor(time / duration * peaks.length));
    if (peak > peaks[index]) peaks[index] = peak;
  }
}

export function parseWaveformCache(
  json: string | null,
  fingerprint: string,
  duration: number,
  samplesPerSecond: number,
  maxBins: number,
): WaveformData | null {
  if (!json) return null;
  try {
    const value = JSON.parse(json) as Partial<WaveformData>;
    if (value.version !== 1 || value.fingerprint !== fingerprint) return null;
    if (!Number.isFinite(value.duration) || Math.abs(Number(value.duration) - duration) > 0.001) return null;
    if (value.samplesPerSecond !== samplesPerSecond || !Array.isArray(value.peaks)) return null;
    const expected = waveformBinCount(duration, samplesPerSecond, maxBins);
    if (value.peaks.length !== expected) return null;
    if (!value.peaks.every((peak) => typeof peak === 'number' && Number.isFinite(peak) && peak >= 0 && peak <= 1)) return null;
    return value as WaveformData;
  } catch {
    return null;
  }
}

export function clampWaveformPeak(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
