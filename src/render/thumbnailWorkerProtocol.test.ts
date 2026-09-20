import { describe, expect, it } from 'vitest';
import { supportsTimelineThumbnailWorker, thumbnailWorkerError } from './thumbnailWorkerProtocol';

describe('timeline thumbnail worker protocol', () => {
  it('requires both Worker and OffscreenCanvas', () => {
    expect(supportsTimelineThumbnailWorker({ Worker: class {}, OffscreenCanvas: class {} } as unknown as typeof globalThis)).toBe(true);
    expect(supportsTimelineThumbnailWorker({ Worker: class {} } as unknown as typeof globalThis)).toBe(false);
    expect(supportsTimelineThumbnailWorker({ OffscreenCanvas: class {} } as unknown as typeof globalThis)).toBe(false);
  });

  it('normalizes worker errors without leaking unusable values', () => {
    expect(thumbnailWorkerError(new Error('decode failed'))).toBe('decode failed');
    expect(thumbnailWorkerError('cancelled')).toBe('cancelled');
    expect(thumbnailWorkerError(null)).toBe('Timeline thumbnail worker failed');
  });
});
