import { describe, expect, it } from 'vitest';
import { buildRenderAcceptancePlan, planAudioChunks, validateRenderAcceptancePlan } from './renderSchedule';

describe('render acceptance schedule', () => {
  it('tiles short audio exactly with an integer-sample tail chunk', () => {
    const chunks = planAudioChunks(5.125, 2, 48_000);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toMatchObject({ startSample: 0, endSample: 96_000, sampleCount: 96_000 });
    expect(chunks[1]).toMatchObject({ startSample: 96_000, endSample: 192_000, sampleCount: 96_000 });
    expect(chunks[2].startSample).toBe(192_000);
    expect(chunks[2].endSample).toBe(Math.round(5.125 * 48_000));
    expect(chunks[2].endSeconds).toBeCloseTo(5.125, 10);
  });

  it('does not accumulate chunk-boundary error over a two-hour render', () => {
    const duration = 2 * 60 * 60 + 0.137;
    const chunks = planAudioChunks(duration, 2, 48_000);
    const last = chunks.at(-1)!;

    expect(chunks).toHaveLength(Math.ceil(duration / 2));
    expect(last.endSample).toBe(Math.round(duration * 48_000));
    expect(last.endSeconds).toBeCloseTo(Math.round(duration * 48_000) / 48_000, 12);
    for (let index = 1; index < chunks.length; index += 1) {
      expect(chunks[index].startSample).toBe(chunks[index - 1].endSample);
    }
  });

  it('keeps 30fps video and 48kHz audio ends within one video frame', () => {
    const plan = buildRenderAcceptancePlan(30 * 60 + 0.017, 30, 2, 48_000);
    const validation = validateRenderAcceptancePlan(plan);

    expect(plan.totalFrames).toBeGreaterThan(50_000);
    expect(validation.contiguousAudio).toBe(true);
    expect(validation.exactAudioCoverage).toBe(true);
    expect(validation.avEndWithinOneFrame).toBe(true);
    expect(Math.abs(plan.avEndDeltaSeconds)).toBeLessThanOrEqual(1 / 30 + 1 / 48_000 + 1e-6);
  });

  it('handles 60fps long-form output without unbounded schedule drift', () => {
    const plan = buildRenderAcceptancePlan(90 * 60 + 0.333, 60, 1.5, 48_000);
    const validation = validateRenderAcceptancePlan(plan);

    expect(plan.totalFrames).toBeGreaterThan(300_000);
    expect(validation.contiguousAudio).toBe(true);
    expect(validation.avEndWithinOneFrame).toBe(true);
    expect(plan.audioChunks.length).toBeLessThan(4_000);
  });

  it('returns an empty, valid schedule for zero-duration renders', () => {
    const plan = buildRenderAcceptancePlan(0, 30);
    expect(plan.totalFrames).toBe(0);
    expect(plan.audioChunks).toEqual([]);
    expect(validateRenderAcceptancePlan(plan)).toMatchObject({
      contiguousAudio: true,
      exactAudioCoverage: true,
      avEndWithinOneFrame: true,
    });
  });
});
