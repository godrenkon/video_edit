import { describe, expect, it, vi } from 'vitest';
import { pruneIdleMediaProviders, type MediaProviderEntry } from './mediaAnalysisProviderPool';

function entry(lastUsed: number, activeCount = 0): MediaProviderEntry<{ close(): void }> {
  return { provider: { close: vi.fn() }, lastUsed, activeCount };
}

describe('media analysis provider pool', () => {
  it('evicts the least-recently-used idle provider without closing active decoders', () => {
    const active = entry(1, 1);
    const oldestIdle = entry(2);
    const newestIdle = entry(3);
    const providers = new Map([
      ['active', active],
      ['oldest-idle', oldestIdle],
      ['newest-idle', newestIdle],
    ]);

    pruneIdleMediaProviders(providers, 2, 'newest-idle');

    expect(providers.has('active')).toBe(true);
    expect(active.provider.close).not.toHaveBeenCalled();
    expect(providers.has('oldest-idle')).toBe(false);
    expect(oldestIdle.provider.close).toHaveBeenCalledOnce();
  });

  it('temporarily exceeds the bound when every eviction candidate is active', () => {
    const first = entry(1, 1);
    const second = entry(2, 1);
    const providers = new Map([['first', first], ['second', second]]);

    pruneIdleMediaProviders(providers, 1, 'second');

    expect(providers.size).toBe(2);
    expect(first.provider.close).not.toHaveBeenCalled();
  });
});
