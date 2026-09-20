import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('media analysis worker client', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.resetModules();
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('OffscreenCanvas', class {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('routes thumbnail and waveform responses through one shared worker', async () => {
    const client = await import('./mediaAnalysisWorkerClient');
    const thumbnail = client.renderTimelineThumbnailInWorker('asset:a', new Blob(['a']), 1);
    const waveform = client.analyzeWaveformInWorker('asset:a', new Blob(['a']), {
      duration: 2,
      samplesPerSecond: 10,
      maxBins: 100,
      chunkSeconds: 30,
    });
    const instance = FakeWorker.instances[0];
    const thumbnailRequest = instance.sent[0] as { id: number };
    const waveformRequest = instance.sent[1] as { id: number };
    const thumbnailBlob = new Blob(['thumb'], { type: 'image/webp' });

    instance.onmessage?.({
      data: { id: waveformRequest.id, kind: 'waveform', ok: true, peaks: [0.25, 0.75] },
    } as MessageEvent);
    instance.onmessage?.({
      data: { id: thumbnailRequest.id, kind: 'thumbnail', ok: true, blob: thumbnailBlob },
    } as MessageEvent);

    await expect(thumbnail).resolves.toBe(thumbnailBlob);
    await expect(waveform).resolves.toEqual([0.25, 0.75]);
    expect(FakeWorker.instances).toHaveLength(1);
    client.disposeMediaAnalysisWorker();
    expect(instance.terminated).toBe(true);
  });

  it('cancels aborted waveform work in the worker', async () => {
    const client = await import('./mediaAnalysisWorkerClient');
    const controller = new AbortController();
    const request = client.analyzeWaveformInWorker('asset:a', new Blob(['a']), {
      duration: 2,
      samplesPerSecond: 10,
      maxBins: 100,
      chunkSeconds: 30,
      signal: controller.signal,
    });
    const instance = FakeWorker.instances[0];
    const analysisRequest = instance.sent[0] as { id: number };
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(instance.sent).toContainEqual({ kind: 'cancel', id: analysisRequest.id });
  });

  it('rejects a response whose media kind does not match the request', async () => {
    const client = await import('./mediaAnalysisWorkerClient');
    const request = client.renderTimelineThumbnailInWorker('asset:a', new Blob(['a']), 1);
    const instance = FakeWorker.instances[0];
    const sent = instance.sent[0] as { id: number };

    instance.onmessage?.({ data: { id: sent.id, kind: 'waveform', ok: true, peaks: [] } } as MessageEvent);
    await expect(request).rejects.toThrow('mismatched response');
  });

  it('preserves cancellation errors returned by the worker', async () => {
    const client = await import('./mediaAnalysisWorkerClient');
    const request = client.analyzeWaveformInWorker('asset:a', new Blob(['a']), {
      duration: 2,
      samplesPerSecond: 10,
      maxBins: 100,
      chunkSeconds: 30,
    });
    const instance = FakeWorker.instances[0];
    const sent = instance.sent[0] as { id: number };

    instance.onmessage?.({
      data: { id: sent.id, kind: 'waveform', ok: false, error: 'resources cleared', errorName: 'AbortError' },
    } as MessageEvent);

    await expect(request).rejects.toMatchObject({ name: 'AbortError', message: 'resources cleared' });
  });

  it('clears only resources belonging to the requested asset', async () => {
    const client = await import('./mediaAnalysisWorkerClient');
    const request = client.renderTimelineThumbnailInWorker('asset:a', new Blob(['a']), 1);
    const instance = FakeWorker.instances[0];
    const sent = instance.sent[0] as { id: number };

    client.clearMediaAnalysisWorker('asset');
    expect(instance.sent[1]).toEqual({ kind: 'clear', assetId: 'asset' });
    instance.onmessage?.({ data: { id: sent.id, kind: 'thumbnail', ok: true, blob: null } } as MessageEvent);
    await expect(request).resolves.toBeNull();
    expect(instance.terminated).toBe(false);
  });

  it('rejects pending work and disables the worker after a crash', async () => {
    const client = await import('./mediaAnalysisWorkerClient');
    const request = client.renderTimelineThumbnailInWorker('asset:a', new Blob(['a']), 1);
    const instance = FakeWorker.instances[0];
    instance.onerror?.({ message: 'worker crashed' } as ErrorEvent);

    await expect(request).rejects.toThrow('worker crashed');
    expect(instance.terminated).toBe(true);
    expect(client.canUseMediaAnalysisWorker()).toBe(false);
    await expect(client.renderTimelineThumbnailInWorker('asset:a', new Blob(), 2)).rejects.toThrow('unavailable');
  });
});
