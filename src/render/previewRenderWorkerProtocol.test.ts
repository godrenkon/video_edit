import { describe, expect, it } from 'vitest';
import {
  previewRenderWorkerError,
  previewRenderWorkerErrorName,
  supportsPreviewRenderWorker,
} from './previewRenderWorkerProtocol';

const supportedEnvironment = {
  Worker: class {},
  OffscreenCanvas: class {},
  createImageBitmap() {},
  navigator: { storage: { getDirectory() {} } },
} as unknown as typeof globalThis;

describe('preview render worker protocol', () => {
  it('requires the worker, canvas, bitmap and OPFS capabilities used by the renderer', () => {
    expect(supportsPreviewRenderWorker(supportedEnvironment)).toBe(true);
    expect(supportsPreviewRenderWorker({ ...supportedEnvironment, Worker: undefined } as unknown as typeof globalThis)).toBe(false);
    expect(supportsPreviewRenderWorker({ ...supportedEnvironment, OffscreenCanvas: undefined } as unknown as typeof globalThis)).toBe(false);
    expect(supportsPreviewRenderWorker({ ...supportedEnvironment, createImageBitmap: undefined } as unknown as typeof globalThis)).toBe(false);
    expect(supportsPreviewRenderWorker({ ...supportedEnvironment, navigator: {} } as unknown as typeof globalThis)).toBe(false);
  });

  it('normalizes worker errors without exposing unusable values', () => {
    expect(previewRenderWorkerError(new Error('render failed'))).toBe('render failed');
    expect(previewRenderWorkerError('cancelled')).toBe('cancelled');
    expect(previewRenderWorkerError(null)).toBe('Preview render worker failed');
    expect(previewRenderWorkerErrorName(new DOMException('cancelled', 'AbortError'))).toBe('AbortError');
    expect(previewRenderWorkerErrorName(null)).toBeUndefined();
  });
});
