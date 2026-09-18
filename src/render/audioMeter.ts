export interface AudioMeterReading {
  peak: number;
  rms: number;
  peakDb: number;
  rmsDb: number;
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
