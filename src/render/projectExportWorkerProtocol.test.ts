import { describe, expect, it } from 'vitest';
import {
  PROJECT_EXPORT_WORKER_UNAVAILABLE,
  projectExportWorkerError,
  projectExportWorkerErrorName,
  projectExportWorkerUnavailable,
  supportsProjectExportWorker,
} from './projectExportWorkerProtocol';

const supportedEnvironment = {
  Worker: class {},
  OffscreenCanvas: class {},
  AudioEncoder: class {},
  AudioDecoder: class {},
  VideoEncoder: class {},
  VideoDecoder: class {},
  navigator: { storage: { getDirectory() {} } },
} as unknown as typeof globalThis;

describe('project export worker protocol', () => {
  it('requires the platform primitives shared by every worker export', () => {
    expect(supportsProjectExportWorker(supportedEnvironment)).toBe(true);
    expect(supportsProjectExportWorker({ ...supportedEnvironment, Worker: undefined } as unknown as typeof globalThis)).toBe(false);
    expect(supportsProjectExportWorker({ ...supportedEnvironment, OffscreenCanvas: undefined } as unknown as typeof globalThis)).toBe(false);
    expect(supportsProjectExportWorker({ ...supportedEnvironment, VideoEncoder: undefined } as unknown as typeof globalThis)).toBe(false);
    expect(supportsProjectExportWorker({ ...supportedEnvironment, VideoDecoder: undefined } as unknown as typeof globalThis)).toBe(false);
    expect(supportsProjectExportWorker({
      ...supportedEnvironment,
      AudioEncoder: undefined,
      AudioDecoder: undefined,
    } as unknown as typeof globalThis)).toBe(true);
    expect(supportsProjectExportWorker({ ...supportedEnvironment, navigator: {} } as unknown as typeof globalThis)).toBe(false);
  });

  it('normalizes runtime and infrastructure errors', () => {
    const unavailable = projectExportWorkerUnavailable('missing API');
    expect(unavailable.name).toBe(PROJECT_EXPORT_WORKER_UNAVAILABLE);
    expect(projectExportWorkerError(unavailable)).toBe('missing API');
    expect(projectExportWorkerErrorName(unavailable)).toBe(PROJECT_EXPORT_WORKER_UNAVAILABLE);
    expect(projectExportWorkerError(null)).toBe('Project export worker failed');
    expect(projectExportWorkerErrorName(null)).toBeUndefined();
  });
});
