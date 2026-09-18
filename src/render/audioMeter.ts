export interface AudioMeterReading {
  peak: number;
  rms: number;
  peakDb: number;
  rmsDb: number;
  lufsMomentary?: number;
}

export function measureAudioSamples(samples: ArrayLike<number>): AudioMeterReading {
  let peak = 0;
  let sumSquares = 0;
  const length = Math.max(0, samples.length ?? 0);

  for (let index = 0; index < length; index += 1) {
    const value = finite(Number(samples[index]));
    peak = Math.max(peak, Math.abs(value));
    sumSquares += value * value;
  }

  const rms = length > 0 ? Math.sqrt(sumSquares / length) : 0;
  return {
    peak,
    rms,
    peakDb: amplitudeToDb(peak),
    rmsDb: amplitudeToDb(rms),
  };
}

export function amplitudeToDb(amplitude: number) {
  const safe = Math.max(1e-6, Math.abs(finite(amplitude)));
  return Math.max(-120, 20 * Math.log10(safe));
}

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}


/**
 * Converts K-weighted mean-square energy to a BS.1770-style loudness value.
 * The -0.691 dB calibration offset is defined by ITU-R BS.1770. Realtime
 * preview uses a Web Audio K-weighting approximation before this function.
 */
export function loudnessFromMeanSquare(meanSquare: number) {
  const safe = Math.max(1e-12, finite(meanSquare));
  return Math.max(-120, -0.691 + 10 * Math.log10(safe));
}

export function measureKWeightedLoudness(samples: ArrayLike<number>) {
  const length = Math.max(0, samples.length ?? 0);
  if (length === 0) return -120;
  let sumSquares = 0;
  for (let index = 0; index < length; index += 1) {
    const value = finite(Number(samples[index]));
    sumSquares += value * value;
  }
  return loudnessFromMeanSquare(sumSquares / length);
}

/**
 * AnalyserNode requires a power-of-two FFT size. Choose the largest block not
 * exceeding the 400 ms LUFS-M window so the meter stays responsive.
 */
export function loudnessAnalyserFftSize(sampleRate: number) {
  const target = Math.max(32, Math.min(32768, Math.floor(Math.max(8000, finite(sampleRate)) * 0.4)));
  let size = 32;
  while (size * 2 <= target && size < 32768) size *= 2;
  return size;
}
