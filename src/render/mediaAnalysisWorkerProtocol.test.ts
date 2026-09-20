import { describe, expect, it } from 'vitest';
import {
  mediaAnalysisWorkerError,
  mediaAnalysisWorkerErrorName,
  mediaAnalysisClearMatches,
  supportsMediaAnalysisWorker,
} from './mediaAnalysisWorkerProtocol';

describe('media analysis worker protocol', () => {
  it('requires both Worker and OffscreenCanvas', () => {
    expect(supportsMediaAnalysisWorker({ Worker: class {}, OffscreenCanvas: class {} } as unknown as typeof globalThis)).toBe(true);
    expect(supportsMediaAnalysisWorker({ Worker: class {} } as unknown as typeof globalThis)).toBe(false);
    expect(supportsMediaAnalysisWorker({ OffscreenCanvas: class {} } as unknown as typeof globalThis)).toBe(false);
  });

  it('normalizes worker errors without exposing unusable values', () => {
    expect(mediaAnalysisWorkerError(new Error('decode failed'))).toBe('decode failed');
    expect(mediaAnalysisWorkerError('cancelled')).toBe('cancelled');
    expect(mediaAnalysisWorkerError(null)).toBe('Media analysis worker failed');
    expect(mediaAnalysisWorkerErrorName(new DOMException('cancelled', 'AbortError'))).toBe('AbortError');
    expect(mediaAnalysisWorkerErrorName(null)).toBeUndefined();
  });

  it('matches resource clearing by both asset boundary and media kind', () => {
    const thumbnails = { kind: 'clear' as const, assetId: 'asset', mediaKind: 'thumbnail' as const };
    expect(mediaAnalysisClearMatches(thumbnails, 'asset:thumb:1', 'thumbnail')).toBe(true);
    expect(mediaAnalysisClearMatches(thumbnails, 'asset:waveform:1', 'waveform')).toBe(false);
    expect(mediaAnalysisClearMatches(thumbnails, 'asset-two:thumb:1', 'thumbnail')).toBe(false);
    expect(mediaAnalysisClearMatches({ kind: 'clear' }, 'anything:waveform:1', 'waveform')).toBe(true);
  });
});
