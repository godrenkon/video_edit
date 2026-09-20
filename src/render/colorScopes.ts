export type ColorScopeMode = 'histogram' | 'waveform' | 'parade' | 'vectorscope';

export interface ColorScopeData {
  width: number;
  height: number;
  histogramR: Uint32Array;
  histogramG: Uint32Array;
  histogramB: Uint32Array;
  waveform: Float32Array;
  paradeR: Float32Array;
  paradeG: Float32Array;
  paradeB: Float32Array;
  vectorscope: Float32Array;
  sampleCount: number;
}

export function analyzeColorScopes(image: ImageData, maxSamples = 18000): ColorScopeData {
  const bins = 256;
  const histogramR = new Uint32Array(bins);
  const histogramG = new Uint32Array(bins);
  const histogramB = new Uint32Array(bins);
  const pixelCount = Math.max(1, image.width * image.height);
  const stride = Math.max(1, Math.ceil(pixelCount / Math.max(1, maxSamples)));
  const points: number[] = [];
  const paradeRPoints: number[] = [];
  const paradeGPoints: number[] = [];
  const paradeBPoints: number[] = [];
  const vectorPoints: number[] = [];
  let sampleCount = 0;

  for (let pixel = 0; pixel < pixelCount; pixel += stride) {
    const offset = pixel * 4;
    const alpha = image.data[offset + 3] / 255;
    if (alpha <= 0) continue;
    const r = image.data[offset];
    const g = image.data[offset + 1];
    const b = image.data[offset + 2];
    histogramR[r] += 1;
    histogramG[g] += 1;
    histogramB[b] += 1;

    const x = (pixel % image.width) / Math.max(1, image.width - 1);
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    const luma = clamp(rn * 0.2126 + gn * 0.7152 + bn * 0.0722, 0, 1);
    points.push(x, luma);
    paradeRPoints.push(x, rn);
    paradeGPoints.push(x, gn);
    paradeBPoints.push(x, bn);

    const y = luma;
    const cb = clamp((bn - y) / 1.8556 + 0.5, 0, 1);
    const cr = clamp((rn - y) / 1.5748 + 0.5, 0, 1);
    vectorPoints.push(cb, cr);
    sampleCount += 1;
  }

  return {
    width: image.width,
    height: image.height,
    histogramR,
    histogramG,
    histogramB,
    waveform: new Float32Array(points),
    paradeR: new Float32Array(paradeRPoints),
    paradeG: new Float32Array(paradeGPoints),
    paradeB: new Float32Array(paradeBPoints),
    vectorscope: new Float32Array(vectorPoints),
    sampleCount,
  };
}

export function histogramPeak(data: ColorScopeData) {
  let peak = 1;
  for (let index = 0; index < 256; index += 1) {
    peak = Math.max(peak, data.histogramR[index], data.histogramG[index], data.histogramB[index]);
  }
  return peak;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
