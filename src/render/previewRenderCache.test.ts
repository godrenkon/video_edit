import { describe, expect, it, vi } from 'vitest';
import { awaitSharedPreviewTask, PreviewRenderTaskQueue } from './previewRenderCache';
import { previewCacheDimensions, previewCacheFrameIndex } from './previewRenderPlanning';

describe('preview render cache planning', () => {
  it('quantizes requested preview time to the nearest bounded project frame', () => {
    expect(previewCacheFrameIndex(1.02, 30, 10)).toBe(31);
    expect(previewCacheFrameIndex(-5, 30, 10)).toBe(0);
    expect(previewCacheFrameIndex(99, 30, 10)).toBe(300);
  });

  it('bounds fps before generating cache frame indices', () => {
    expect(previewCacheFrameIndex(1, 999, 10)).toBe(240);
    expect(previewCacheFrameIndex(1, 0, 10)).toBe(1);
  });

  it('downscales landscape preview frames without changing aspect ratio materially', () => {
    expect(previewCacheDimensions(1920, 1080)).toEqual({ width: 960, height: 540 });
    expect(previewCacheDimensions(3840, 2160)).toEqual({ width: 960, height: 540 });
  });

  it('fits portrait and small projects inside cache bounds without upscaling', () => {
    expect(previewCacheDimensions(1080, 1920)).toEqual({ width: 304, height: 540 });
    expect(previewCacheDimensions(640, 360)).toEqual({ width: 640, height: 360 });
  });

  it('does not let one caller cancel shared preview work for another caller', async () => {
    let finish: ((value: string) => void) | undefined;
    const shared = new Promise<string>((resolve) => { finish = resolve; });
    const firstController = new AbortController();
    const secondController = new AbortController();
    const first = awaitSharedPreviewTask(shared, firstController.signal);
    const second = awaitSharedPreviewTask(shared, secondController.signal);
    const firstResult = vi.fn();
    void first.catch(firstResult);

    firstController.abort('superseded');
    await vi.waitFor(() => expect(firstResult).toHaveBeenCalled());
    expect(firstResult.mock.calls[0][0]).toMatchObject({ name: 'AbortError' });

    finish?.('rendered');
    await expect(second).resolves.toBe('rendered');
  });

  it('serializes distinct preview renders that share the same canvases', async () => {
    const queue = new PreviewRenderTaskQueue();
    let finishFirst: (() => void) | undefined;
    const events: string[] = [];
    const first = queue.run(async () => {
      events.push('first:start');
      await new Promise<void>((resolve) => { finishFirst = resolve; });
      events.push('first:end');
    });
    const second = queue.run(async () => {
      events.push('second:start');
      events.push('second:end');
    });

    await vi.waitFor(() => expect(events).toEqual(['first:start']));
    finishFirst?.();
    await Promise.all([first, second]);
    expect(events).toEqual(['first:start', 'first:end', 'second:start', 'second:end']);
  });

  it('continues the preview render queue after a cancelled task', async () => {
    const queue = new PreviewRenderTaskQueue();
    const first = queue.run(async () => { throw new DOMException('cancelled', 'AbortError'); });
    const second = queue.run(async () => 'rendered');

    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await expect(second).resolves.toBe('rendered');
  });
});
