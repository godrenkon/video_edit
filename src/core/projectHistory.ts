import type { Project } from '../types/editor';

export interface AssetRuntimeUrls {
  storageName: string;
  proxyStorageName?: string;
  objectUrl?: string;
  proxyObjectUrl?: string;
}

export type AssetRuntimeUrlRegistry = Map<string, AssetRuntimeUrls>;

/**
 * Undo/redo snapshots must stay pure metadata. Blob URLs are runtime handles,
 * not project data, and keeping them in every history generation needlessly
 * retains stale browser resources.
 */
export function snapshotProjectForHistory(project: Project): Project {
  return {
    ...project,
    assets: project.assets.map(({ objectUrl: _objectUrl, proxyObjectUrl: _proxyObjectUrl, ...asset }) => asset),
  };
}

/**
 * Runtime URLs live once per asset outside the history stack. Entries are kept
 * across undo so a subsequently redone imported asset can recover its preview
 * URL without storing that URL in the history generation itself.
 */
export function captureProjectRuntimeUrls(project: Project, registry: AssetRuntimeUrlRegistry) {
  for (const asset of project.assets) {
    registry.set(asset.id, {
      storageName: asset.storageName,
      proxyStorageName: asset.proxyStorageName,
      objectUrl: asset.objectUrl,
      proxyObjectUrl: asset.proxyObjectUrl,
    });
  }
}

export function restoreProjectRuntimeUrls(project: Project, registry: AssetRuntimeUrlRegistry): Project {
  return {
    ...project,
    assets: project.assets.map((asset) => {
      const runtime = registry.get(asset.id);
      if (!runtime) return asset;
      return {
        ...asset,
        objectUrl: runtime.storageName === asset.storageName ? runtime.objectUrl : undefined,
        proxyObjectUrl: runtime.proxyStorageName
          && runtime.proxyStorageName === asset.proxyStorageName
          ? runtime.proxyObjectUrl
          : undefined,
      };
    }),
  };
}

export function forgetAssetRuntimeUrls(registry: AssetRuntimeUrlRegistry, assetId: string) {
  registry.delete(assetId);
}
