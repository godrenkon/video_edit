import { uid } from './project';
import type { AssetBin, Project } from '../types/editor';

export function normalizeAssetBinName(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 80);
}

export function addAssetBin(project: Project, name: string): Project {
  const normalized = normalizeAssetBinName(name);
  if (!normalized) return project;
  const bins = project.assetBins ?? [];
  if (bins.some((bin) => bin.name.localeCompare(normalized, undefined, { sensitivity: 'accent' }) === 0)) return project;
  const bin: AssetBin = { id: uid('asset_bin'), name: normalized };
  return { ...project, assetBins: [...bins, bin] };
}

export function renameAssetBin(project: Project, binId: string, name: string): Project {
  const normalized = normalizeAssetBinName(name);
  if (!normalized) return project;
  const bins = project.assetBins ?? [];
  const target = bins.find((bin) => bin.id === binId);
  if (!target || target.name === normalized) return project;
  if (bins.some((bin) => bin.id !== binId && bin.name.localeCompare(normalized, undefined, { sensitivity: 'accent' }) === 0)) {
    return project;
  }
  return {
    ...project,
    assetBins: bins.map((bin) => bin.id === binId ? { ...bin, name: normalized } : bin),
  };
}

export function assignAssetBin(project: Project, assetId: string, binId?: string): Project {
  const asset = project.assets.find((item) => item.id === assetId);
  if (!asset) return project;
  const normalizedBinId = binId && project.assetBins?.some((bin) => bin.id === binId) ? binId : undefined;
  if (asset.binId === normalizedBinId) return project;
  return {
    ...project,
    assets: project.assets.map((item) => item.id === assetId ? { ...item, binId: normalizedBinId } : item),
  };
}

export function removeAssetBin(project: Project, binId: string): Project {
  const bins = project.assetBins ?? [];
  if (!bins.some((bin) => bin.id === binId)) return project;
  return {
    ...project,
    assetBins: bins.filter((bin) => bin.id !== binId),
    assets: project.assets.map((asset) => asset.binId === binId ? { ...asset, binId: undefined } : asset),
  };
}
