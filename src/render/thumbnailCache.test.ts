import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetMeta } from '../types/editor';

const mocks = vi.hoisted(() => ({
  readAssetFile: vi.fn(),
  readThumbnailCache: vi.fn(),
  saveThumbnailCache: vi.fn(),
  renderTimelineThumbnailInWorker: vi.fn(),
}));

vi.mock('../core/storage', () => ({
  readAssetFile: mocks.readAssetFile,
  readThumbnailCache: mocks.readThumbnailCache,
  saveThumbnailCache: mocks.saveThumbnailCache,
}));

vi.mock('./mediaAnalysisWorkerClient', () => ({
  canUseMediaAnalysisWorker: () => true,
  clearMediaAnalysisWorker: vi.fn(),
  renderTimelineThumbnailInWorker: mocks.renderTimelineThumbnailInWorker,
}));

vi.mock('./mediabunnyProvider', () => ({
  MediabunnyVideoProvider: class {
    async open() {}
    async getFrameAt() { return null; }
    close() {}
  },
}));

const asset: AssetMeta = {
  id: 'video',
  name: 'Video',
  kind: 'video',
  mime: 'video/mp4',
  size: 1,
  duration: 4,
  storageName: 'video.mp4',
};

describe('timeline thumbnail cache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.readThumbnailCache.mockResolvedValue(null);
    mocks.readAssetFile.mockResolvedValue(new Blob(['video']));
  });

  it('preserves worker cancellation instead of retrying the decode on the main thread', async () => {
    mocks.renderTimelineThumbnailInWorker.mockRejectedValue(new DOMException('cleared', 'AbortError'));
    const { getTimelineThumbnail } = await import('./thumbnailCache');

    await expect(getTimelineThumbnail(asset, 1)).rejects.toMatchObject({ name: 'AbortError' });
    expect(mocks.readAssetFile).toHaveBeenCalledTimes(1);
  });

  it('retains the main-thread fallback for worker infrastructure failures', async () => {
    mocks.renderTimelineThumbnailInWorker.mockRejectedValue(new Error('worker crashed'));
    const { getTimelineThumbnail } = await import('./thumbnailCache');

    await expect(getTimelineThumbnail(asset, 2)).resolves.toBeNull();
    expect(mocks.readAssetFile).toHaveBeenCalledTimes(2);
  });
});
