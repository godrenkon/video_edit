import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../types/editor';

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

const project = { id: 'project:preview-worker' } as Project;

describe('preview render worker client', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.resetModules();
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('OffscreenCanvas', class {});
    vi.stubGlobal('createImageBitmap', vi.fn());
    vi.stubGlobal('navigator', { storage: { getDirectory: vi.fn() } });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shares one worker across sessions and routes rendered frames to the owner', async () => {
    const client = await import('./previewRenderWorkerClient');
    const first = new client.PreviewRenderWorkerSession(project, { maxWidth: 640 });
    const second = new client.PreviewRenderWorkerSession(project);
    const instance = FakeWorker.instances[0];
    const request = first.frame(1.25);
    const render = instance.sent[2] as { requestId: number };
    const bitmap = { close: vi.fn() } as unknown as ImageBitmap;

    instance.onmessage?.({
      data: {
        requestId: render.requestId,
        ok: true,
        bitmap,
        width: 640,
        height: 360,
        frameIndex: 30,
        time: 1.25,
        cached: false,
      },
    } as MessageEvent);

    const frame = await request;
    expect(frame).toMatchObject({
      bitmap,
      width: 640,
      height: 360,
      frameIndex: 30,
      time: 1.25,
      cached: false,
    });
    frame.release();
    frame.release();
    expect(bitmap.close).toHaveBeenCalledOnce();
    expect(FakeWorker.instances).toHaveLength(1);
    expect(instance.sent.slice(0, 2)).toMatchObject([
      { kind: 'init', sessionId: 1, options: { maxWidth: 640 } },
      { kind: 'init', sessionId: 2 },
    ]);

    first.close();
    expect(instance.terminated).toBe(false);
    second.close();
    expect(instance.terminated).toBe(true);
  });

  it('cancels an aborted render request', async () => {
    const client = await import('./previewRenderWorkerClient');
    const session = new client.PreviewRenderWorkerSession(project);
    const controller = new AbortController();
    const request = session.frame(2, controller.signal);
    const instance = FakeWorker.instances[0];
    const render = instance.sent[1] as { requestId: number };
    controller.abort();

    await expect(request).rejects.toMatchObject({ name: 'AbortError' });
    expect(instance.sent).toContainEqual({ kind: 'cancel', requestId: render.requestId });
    session.close();
  });

  it('closes orphaned response bitmaps after cancellation', async () => {
    const client = await import('./previewRenderWorkerClient');
    const session = new client.PreviewRenderWorkerSession(project);
    const controller = new AbortController();
    const request = session.frame(2, controller.signal);
    const instance = FakeWorker.instances[0];
    const render = instance.sent[1] as { requestId: number };
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: 'AbortError' });

    const close = vi.fn();
    instance.onmessage?.({ data: { requestId: render.requestId, ok: true, bitmap: { close } } } as MessageEvent);
    expect(close).toHaveBeenCalledOnce();
    session.close();
  });

  it('rejects pending work and disables the worker after a crash', async () => {
    const client = await import('./previewRenderWorkerClient');
    const session = new client.PreviewRenderWorkerSession(project);
    const request = session.frame(3);
    const instance = FakeWorker.instances[0];
    instance.onerror?.({ message: 'worker crashed' } as ErrorEvent);

    await expect(request).rejects.toThrow('worker crashed');
    expect(instance.terminated).toBe(true);
    expect(client.canUsePreviewRenderWorker()).toBe(false);
    expect(() => new client.PreviewRenderWorkerSession(project)).toThrow('unavailable');
  });
});
