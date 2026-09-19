import { describe, expect, it } from 'vitest';
import { listEffects } from './effects';
import { isAudioEffectSupported, isRealtimeAudioEffectSupported } from '../render/audioEffects';
import { isVisualEffectSupported } from '../render/effectEvaluation';

describe('effect registry rendering contract', () => {
  it('keeps every registered video effect connected to the shared Preview/export renderer', () => {
    const unsupported = listEffects('video')
      .map((effect) => effect.kind)
      .filter((kind) => !isVisualEffectSupported(kind));
    expect(unsupported).toEqual([]);
  });

  it('keeps every registered audio effect connected to offline and realtime render paths', () => {
    const registered = listEffects('audio').map((effect) => effect.kind);
    expect(registered.filter((kind) => !isAudioEffectSupported(kind))).toEqual([]);
    expect(registered.filter((kind) => !isRealtimeAudioEffectSupported(kind))).toEqual([]);
  });

  it('keeps effect kinds unique across the registry', () => {
    const kinds = listEffects().map((effect) => effect.kind);
    expect(new Set(kinds).size).toBe(kinds.length);
  });
});
