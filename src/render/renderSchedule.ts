import { RenderClock } from './clock';

export interface AudioChunkPlan {
  index: number;
  startSample: number;
  endSample: number;
  sampleCount: number;
  startSeconds: number;
  durationSeconds: number;
  endSeconds: number;
}

export interface RenderAcceptancePlan {
  fps: number;
  durationSeconds: number;
  totalFrames: number;
  finalVideoEndSeconds: number;
  sampleRate: number;
  totalAudioSamples: number;
  finalAudioEndSeconds: number;
  avEndDeltaSeconds: number;
  audioChunks: AudioChunkPlan[];
}

/**
 * Plans audio chunks from integer sample indexes instead of repeatedly adding
 * floating-point seconds. This prevents chunk-boundary drift during long renders.
 */
export function planAudioChunks(
  durationSeconds: number,
  chunkSeconds = 2,
  sampleRate = 48_000,
): AudioChunkPlan[] {
  const rate = normalizeSampleRate(sampleRate);
  const duration = normalizeDuration(durationSeconds);
  const totalSamples = Math.max(0, Math.round(duration * rate));
  if (totalSamples === 0) return [];

  const requestedChunkSamples = Math.max(1, Math.round(Math.max(0.001, finite(chunkSeconds, 2)) * rate));
  const chunks: AudioChunkPlan[] = [];

  for (let startSample = 0, index = 0; startSample < totalSamples; startSample += requestedChunkSamples, index += 1) {
    const endSample = Math.min(totalSamples, startSample + requestedChunkSamples);
    const sampleCount = endSample - startSample;
    chunks.push({
      index,
      startSample,
      endSample,
      sampleCount,
      startSeconds: startSample / rate,
      durationSeconds: sampleCount / rate,
      endSeconds: endSample / rate,
    });
  }

  return chunks;
}

/**
 * Produces a deterministic A/V schedule summary used by automated acceptance
 * tests and diagnostics. Audio end time is sample-accurate; video end time is
 * frame-accurate and may extend by less than one frame beyond the requested
 * duration depending on the frame clock.
 */
export function buildRenderAcceptancePlan(
  durationSeconds: number,
  fps: number,
  audioChunkSeconds = 2,
  sampleRate = 48_000,
): RenderAcceptancePlan {
  const duration = normalizeDuration(durationSeconds);
  const safeFps = Math.max(1, finite(fps, 30));
  const rate = normalizeSampleRate(sampleRate);
  const clock = new RenderClock(safeFps);
  const totalFrames = clock.framesForDuration(duration);
  const lastRequest = totalFrames > 0
    ? clock.request(totalFrames - 1, { width: 1, height: 1 })
    : null;
  const finalVideoEndSeconds = lastRequest
    ? (lastRequest.timestampUs + lastRequest.durationUs) / 1_000_000
    : 0;

  const audioChunks = planAudioChunks(duration, audioChunkSeconds, rate);
  const totalAudioSamples = audioChunks.at(-1)?.endSample ?? 0;
  const finalAudioEndSeconds = totalAudioSamples / rate;

  return {
    fps: safeFps,
    durationSeconds: duration,
    totalFrames,
    finalVideoEndSeconds,
    sampleRate: rate,
    totalAudioSamples,
    finalAudioEndSeconds,
    avEndDeltaSeconds: finalVideoEndSeconds - finalAudioEndSeconds,
    audioChunks,
  };
}

export function validateRenderAcceptancePlan(plan: RenderAcceptancePlan) {
  const frameDuration = 1 / Math.max(1, plan.fps);
  const sampleDuration = 1 / Math.max(1, plan.sampleRate);
  const maxExpectedDelta = frameDuration + sampleDuration + 1e-6;

  const contiguousAudio = plan.audioChunks.every((chunk, index) => {
    if (chunk.sampleCount <= 0 || chunk.endSample <= chunk.startSample) return false;
    if (index === 0) return chunk.startSample === 0;
    return plan.audioChunks[index - 1].endSample === chunk.startSample;
  });

  const finalChunk = plan.audioChunks.at(-1);
  const exactAudioCoverage = plan.totalAudioSamples === 0
    ? plan.durationSeconds === 0
    : Boolean(finalChunk && finalChunk.endSample === plan.totalAudioSamples);

  return {
    contiguousAudio,
    exactAudioCoverage,
    avEndWithinOneFrame: Math.abs(plan.avEndDeltaSeconds) <= maxExpectedDelta,
    maxExpectedDelta,
  };
}

function normalizeDuration(value: number) {
  return Math.max(0, finite(value, 0));
}

function normalizeSampleRate(value: number) {
  return Math.max(8_000, Math.round(finite(value, 48_000)));
}

function finite(value: number, fallback: number) {
  return Number.isFinite(value) ? value : fallback;
}
