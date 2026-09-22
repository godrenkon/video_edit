import {
  deleteAssetFile,
  deleteThumbnailCachesForAsset,
  deleteWaveformCache,
  saveAssetFile,
} from '../core/storage';
import type { AssetMeta } from '../types/editor';
import { clearMediaAnalysisWorker } from './mediaAnalysisWorkerClient';

export async function replaceRelinkedAssetStorage(
  asset: Pick<AssetMeta, 'id' | 'storageName' | 'proxyStorageName'>,
  file: File,
  waveformKey: string,
  useOpfs: boolean,
) {
  if (useOpfs) await saveAssetFile(asset.storageName, file);

  clearMediaAnalysisWorker(asset.id);
  if (!useOpfs) return;

  if (asset.proxyStorageName) await deleteAssetFile(asset.proxyStorageName).catch(() => undefined);
  await deleteWaveformCache(waveformKey).catch(() => undefined);
  await deleteThumbnailCachesForAsset(asset.id).catch(() => undefined);
}

export async function deleteAssetStorageBeforeInvalidation(
  asset: Pick<AssetMeta, 'id' | 'storageName' | 'proxyStorageName'>,
  waveformKey: string,
  useOpfs: boolean,
) {
  if (useOpfs) await deleteAssetFile(asset.storageName);

  clearMediaAnalysisWorker(asset.id);
  if (!useOpfs) return;

  if (asset.proxyStorageName) await deleteAssetFile(asset.proxyStorageName).catch(() => undefined);
  await deleteWaveformCache(waveformKey).catch(() => undefined);
  await deleteThumbnailCachesForAsset(asset.id).catch(() => undefined);
}
