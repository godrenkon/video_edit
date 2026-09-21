import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  events: [] as string[],
  saveAssetFile: vi.fn(),
  deleteAssetFile: vi.fn(),
  deleteWaveformCache: vi.fn(),
  deleteThumbnailCachesForAsset: vi.fn(),
  clearMediaAnalysisWorker: vi.fn(),
}));

vi.mock('../core/storage', () => ({
  saveAssetFile: mocks.saveAssetFile,
  deleteAssetFile: mocks.deleteAssetFile,
  deleteWaveformCache: mocks.deleteWaveformCache,
  deleteThumbnailCachesForAsset: mocks.deleteThumbnailCachesForAsset,
}));

vi.mock('./mediaAnalysisWorkerClient', () => ({
  clearMediaAnalysisWorker: mocks.clearMediaAnalysisWorker,
}));

const asset = {
  id: 'asset',
  storageName: 'asset.mp4',
  proxyStorageName: 'asset.proxy.mp4',
};

describe('asset relink lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.events.length = 0;
    mocks.saveAssetFile.mockImplementation(async () => { mocks.events.push('save'); });
    mocks.clearMediaAnalysisWorker.mockImplementation(() => { mocks.events.push('clear'); });
    mocks.deleteAssetFile.mockImplementation(async () => { mocks.events.push('delete-proxy'); });
    mocks.deleteWaveformCache.mockImplementation(async () => { mocks.events.push('delete-waveform'); });
    mocks.deleteThumbnailCachesForAsset.mockImplementation(async () => { mocks.events.push('delete-thumbnails'); });
  });

  it('does not cancel analysis when replacement storage fails', async () => {
    mocks.saveAssetFile.mockRejectedValue(new Error('quota exceeded'));
    const { replaceRelinkedAssetStorage } = await import('./assetRelinkLifecycle');

    await expect(replaceRelinkedAssetStorage(asset, new File(['video'], 'video.mp4'), 'waveform', true))
      .rejects.toThrow('quota exceeded');
    expect(mocks.clearMediaAnalysisWorker).not.toHaveBeenCalled();
    expect(mocks.deleteAssetFile).not.toHaveBeenCalled();
  });

  it('cancels analysis only after storage commits and before cache cleanup', async () => {
    const { replaceRelinkedAssetStorage } = await import('./assetRelinkLifecycle');

    await replaceRelinkedAssetStorage(asset, new File(['video'], 'video.mp4'), 'waveform', true);
    expect(mocks.events).toEqual([
      'save',
      'clear',
      'delete-proxy',
      'delete-waveform',
      'delete-thumbnails',
    ]);
  });
});
