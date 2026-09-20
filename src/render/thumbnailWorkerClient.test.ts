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

describe('timeline thumbnail worker client', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.resetModules();
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('OffscreenCanvas', class {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves the matching worker response and reuses one worker', async () => {
    const client = await import('./thumbnailWorkerClient');
    const first = client.renderTimelineThumbnailInWorker('asset:a', new Blob(['a']), 1);
    const second = client.renderTimelineThumbnailInWorker('asset:a', new Blob(['a']), 2);
    const instance = FakeWorker.instances[0];
    const firstRequest = instance.sent[0] as { id: number };
    const secondRequest = instance.sent[1] as { id: number };
    const firstBlob = new Blob(['first'], { type: 'image/webp' });

    instance.onmessage?.({ data: { id: secondRequest.id, ok: true, blob: null } } as MessageEvent);
    instance.onmessage?.({ data: { id: firstRequest.id, ok: true, blob: firstBlob } } as MessageEvent);

    await expect(first).resolves.toBe(firstBlob);
    await expect(second).resolves.toBeNull();
    expect(FakeWorker.instances).toHaveLength(1);
    client.disposeTimelineThumbnailWorker();
    expect(instance.terminated).toBe(true);
  });

  it('rejects pending work and disables the worker after a crash', async () => {
    const client = await import('./thumbnailWorkerClient');
    const request = client.renderTimelineThumbnailInWorker('asset:a', new Blob(['a']), 1);
    const instance = FakeWorker.instances[0];
    instance.onerror?.({ message: 'worker crashed' } as ErrorEvent);

    await expect(request).rejects.toThrow('worker crashed');
    expect(instance.terminated).toBe(true);
    expect(client.canRenderTimelineThumbnailInWorker()).toBe(false);
    await expect(client.renderTimelineThumbnailInWorker('asset:a', new Blob(), 2)).rejects.toThrow('unavailable');
  });

  it('rejects pending work when explicitly disposed', async () => {
    const client = await import('./thumbnailWorkerClient');
    const request = client.renderTimelineThumbnailInWorker('asset:a', new Blob(['a']), 1);
    client.disposeTimelineThumbnailWorker();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
  });
});
