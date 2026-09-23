import type { Project } from '../types/editor';

export type AssetRuntimeUrlRegistry = Map<
  string,
  [storageName: string, proxyStorageName?: string, objectUrl?: string, proxyObjectUrl?: string]
>;

export function snapshotProjectForHistory(project: Project): Project {
  return structuredClone({
    ...project,
    assets: project.assets.map(({ objectUrl: _objectUrl, proxyObjectUrl: _proxyObjectUrl, ...asset }) => asset),
  });
}

export function captureProjectRuntimeUrls(project: Project, registry: AssetRuntimeUrlRegistry) {
  for (const asset of project.assets) {
    registry.set(asset.id, [
      asset.storageName,
      asset.proxyStorageName,
      asset.objectUrl,
      asset.proxyObjectUrl,
    ]);
  }
}

export function restoreProjectRuntimeUrls(project: Project, registry: AssetRuntimeUrlRegistry): Project {
  return {
    ...project,
    assets: project.assets.map((asset) => {
      const runtime = registry.get(asset.id);
      if (!runtime) return asset;
      const [storageName, proxyStorageName, objectUrl, proxyObjectUrl] = runtime;
      return {
        ...asset,
        objectUrl: storageName === asset.storageName ? objectUrl : undefined,
        proxyObjectUrl: proxyStorageName && proxyStorageName === asset.proxyStorageName
          ? proxyObjectUrl
          : undefined,
      };
    }),
  };
}

export function forgetAssetRuntimeUrls(registry: AssetRuntimeUrlRegistry, assetId: string) {
  registry.delete(assetId);
}
