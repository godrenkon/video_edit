import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../types/editor';
import type { ProjectVideoExportResult } from './projectExporter';
import { PROJECT_EXPORT_WORKER_UNAVAILABLE } from './projectExportWorkerProtocol';

class FakeWorker {
  static instances: FakeWorker[] = [];
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: (() => void) | null = null;
  sent: unknown[] = [];
  terminated = false;

  constructor() {
    FakeWorker.instances.push(this);
  }

  postMessage(message: unknown) {
    this.sent.push(message);
  }

  terminate() {
    this.terminated = true;
  }
}

const project = {
  version: 2,
  id: 'project:export-worker',
  name: 'Worker export',
  width: 1280,
  height: 720,
  fps: 30,
  background: '#000000',
  duration: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  assets: [],
  tracks: [],
  markers: [],
} satisfies Project;

function memoryResult() {
  return {
    storage: 'memory',
    blob: new Blob(['video'], { type: 'video/mp4' }),
    fileName: 'worker-export.mp4',
    mimeType: 'video/mp4',
    hasAudio: false,
    range: { startSeconds: 0, endSeconds: 2, durationSeconds: 2 },
    container: 'mp4',
    codec: 'h264',
    width: 1280,
    height: 720,
  } satisfies ProjectVideoExportResult;
}

describe('project export worker client', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.resetModules();
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('OffscreenCanvas', class {});
    vi.stubGlobal('VideoEncoder', class {});
    vi.stubGlobal('VideoDecoder', class {});
    vi.stubGlobal('navigator', { storage: { getDirectory: vi.fn() } });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('routes progress and completion while stripping callbacks from the worker payload', async () => {
    const client = await import('./projectExportWorkerClient');
    const onProgress = vi.fn();
    const controller = new AbortController();
    const request = client.exportProjectVideoInWorker(project, {
      preferOpfs: false,
      signal: controller.signal,
      onProgress,
    });
    const instance = FakeWorker.instances[0];
    const sent = instance.sent[0] as { id: number; options: Record<string, unknown> };
    const progress = { completedFrames: 15, totalFrames: 60, fraction: 0.25, elapsedMs: 100 };

    expect(sent.options).toEqual({ preferOpfs: false });
    expect(sent.options).not.toHaveProperty('signal');
    expect(sent.options).not.toHaveProperty('onProgress');
    instance.onmessage?.({ data: { kind: 'progress', id: sent.id, progress } } as MessageEvent);
    instance.onmessage?.({ data: { kind: 'complete', id: sent.id, result: memoryResult() } } as MessageEvent);

    await expect(request).resolves.toMatchObject({ storage: 'memory', fileName: 'worker-export.mp4' });
    expect(onProgress).toHaveBeenCalledWith(progress);
    expect(instance.terminated).toBe(true);
  });

  it('cancels an active export and waits for worker cleanup before termination', async () => {
    vi.useFakeTimers();
    const client = await import('./projectExportWorkerClient');
    const controller = new AbortController();
    const request = client.exportProjectVideoInWorker(project, { signal: controller.signal });
    const instance = FakeWorker.instances[0];
    const sent = instance.sent[0] as { id: number };
    controller.abort('stop export');

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(instance.sent).toContainEqual({ kind: 'cancel', id: sent.id });
    expect(instance.terminated).toBe(false);

    instance.onmessage?.({
      data: { kind: 'error', id: sent.id, error: 'Project export cancelled', errorName: 'AbortError' },
    } as MessageEvent);
    expect(instance.terminated).toBe(true);
  });

  it('force-terminates a cancelled worker that never acknowledges cleanup', async () => {
    vi.useFakeTimers();
    const client = await import('./projectExportWorkerClient');
    const controller = new AbortController();
    const request = client.exportProjectVideoInWorker(project, { signal: controller.signal });
    const instance = FakeWorker.instances[0];
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(instance.terminated).toBe(true);
  });

  it('preserves worker-unavailable errors so the facade can use its fallback', async () => {
    const client = await import('./projectExportWorkerClient');
    const request = client.exportProjectVideoInWorker(project);
    const instance = FakeWorker.instances[0];
    const sent = instance.sent[0] as { id: number };
    instance.onmessage?.({
      data: {
        kind: 'error',
        id: sent.id,
        error: 'AudioBuffer is unavailable',
        errorName: PROJECT_EXPORT_WORKER_UNAVAILABLE,
      },
    } as MessageEvent);

    await expect(request).rejects.toMatchObject({
      name: PROJECT_EXPORT_WORKER_UNAVAILABLE,
      message: 'AudioBuffer is unavailable',
    });
  });

  it('rejects pending work and disables the worker after a crash', async () => {
    const client = await import('./projectExportWorkerClient');
    const request = client.exportProjectVideoInWorker(project);
    const instance = FakeWorker.instances[0];
    instance.onerror?.({ message: 'worker crashed' } as ErrorEvent);

    await expect(request).rejects.toMatchObject({
      name: PROJECT_EXPORT_WORKER_UNAVAILABLE,
      message: 'worker crashed',
    });
    expect(instance.terminated).toBe(true);
    expect(client.canUseProjectExportWorker()).toBe(false);
  });
});
