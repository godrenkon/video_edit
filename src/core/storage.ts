import type { Project } from '../types/editor';
import { migrateProject } from './migration';

const PROJECT_FILE = 'project.json';
const ASSET_DIR = 'assets';
const SNAPSHOT_DIR = 'snapshots';
const WAVEFORM_DIR = 'waveforms';
const THUMBNAIL_DIR = 'thumbnails';
const SNAPSHOT_COUNT = 8;
const SNAPSHOT_INTERVAL_MS = 30_000;
let lastSnapshotAt = 0;

export interface RecoverySnapshotInfo {
  id: string;
  lastModified: number;
  size: number;
  projectName: string;
  projectUpdatedAt: string;
}

async function root() {
  if (!navigator.storage?.getDirectory) throw new Error('OPFS is not available');
  return navigator.storage.getDirectory();
}

export async function requestPersistentStorage() {
  try {
    if (navigator.storage?.persist) await navigator.storage.persist();
  } catch {
    // Non-fatal. OPFS still works without explicit persistence grant.
  }
}

export async function saveAssetFile(storageName: string, file: Blob) {
  const r = await root();
  const dir = await r.getDirectoryHandle(ASSET_DIR, { create: true });
  const handle = await dir.getFileHandle(storageName, { create: true });
  const writable = await handle.createWritable();
  await writable.write(file);
  await writable.close();
}

export async function readAssetFile(storageName: string): Promise<File> {
  const r = await root();
  const dir = await r.getDirectoryHandle(ASSET_DIR, { create: true });
  const handle = await dir.getFileHandle(storageName);
  return handle.getFile();
}

export async function deleteAssetFile(storageName: string) {
  const r = await root();
  const dir = await r.getDirectoryHandle(ASSET_DIR, { create: true });
  await dir.removeEntry(storageName).catch(() => undefined);
}

export async function saveWaveformCache(cacheKey: string, json: string) {
  const r = await root();
  const dir = await r.getDirectoryHandle(WAVEFORM_DIR, { create: true });
  const handle = await dir.getFileHandle(waveformCacheFileName(cacheKey), { create: true });
  await writeText(handle, json);
}

export async function readWaveformCache(cacheKey: string): Promise<string | null> {
  try {
    const r = await root();
    const dir = await r.getDirectoryHandle(WAVEFORM_DIR);
    const handle = await dir.getFileHandle(waveformCacheFileName(cacheKey));
    const file = await handle.getFile();
    return file.text();
  } catch {
    return null;
  }
}

export async function deleteWaveformCache(cacheKey: string) {
  try {
    const r = await root();
    const dir = await r.getDirectoryHandle(WAVEFORM_DIR);
    await dir.removeEntry(waveformCacheFileName(cacheKey)).catch(() => undefined);
  } catch {
    // Missing cache directory is equivalent to an empty cache.
  }
}

export async function saveThumbnailCache(assetId: string, cacheKey: string, blob: Blob) {
  const r = await root();
  const rootDir = await r.getDirectoryHandle(THUMBNAIL_DIR, { create: true });
  const assetDir = await rootDir.getDirectoryHandle(thumbnailAssetDirectoryName(assetId), { create: true });
  const handle = await assetDir.getFileHandle(thumbnailCacheFileName(cacheKey), { create: true });
  const writable = await handle.createWritable();
  await writable.write(blob);
  await writable.close();
}

export async function readThumbnailCache(assetId: string, cacheKey: string): Promise<File | null> {
  try {
    const r = await root();
    const rootDir = await r.getDirectoryHandle(THUMBNAIL_DIR);
    const assetDir = await rootDir.getDirectoryHandle(thumbnailAssetDirectoryName(assetId));
    const handle = await assetDir.getFileHandle(thumbnailCacheFileName(cacheKey));
    const file = await handle.getFile();
    return file.size > 0 ? file : null;
  } catch {
    return null;
  }
}

export async function deleteThumbnailCachesForAsset(assetId: string) {
  try {
    const r = await root();
    const dir = await r.getDirectoryHandle(THUMBNAIL_DIR);
    await dir.removeEntry(thumbnailAssetDirectoryName(assetId), { recursive: true }).catch(() => undefined);
  } catch {
    // Missing cache directory is equivalent to an empty cache.
  }
}

export async function saveProject(project: Project) {
  const r = await root();
  const safeProject = serializableProject(project);
  const json = JSON.stringify(safeProject, null, 2);

  const now = Date.now();
  if (now - lastSnapshotAt >= SNAPSHOT_INTERVAL_MS) {
    await writeSnapshot(r, json, now).catch((error) => {
      console.warn('Failed to write recovery snapshot', error);
    });
    lastSnapshotAt = now;
  }

  const handle = await r.getFileHandle(PROJECT_FILE, { create: true });
  await writeText(handle, json);
}

export async function loadProject(): Promise<Project | null> {
  const r = await root();

  try {
    const handle = await r.getFileHandle(PROJECT_FILE);
    const file = await handle.getFile();
    return migrateProject(JSON.parse(await file.text()));
  } catch (error) {
    console.warn('Main project load failed; checking recovery snapshots', error);
    return loadLatestRecoverySnapshot(r);
  }
}

export async function listRecoverySnapshots(): Promise<RecoverySnapshotInfo[]> {
  const r = await root();
  const entries = await readSnapshotEntries(r);
  return entries.map(({ id, file, project }) => ({
    id,
    lastModified: file.lastModified,
    size: file.size,
    projectName: project.name,
    projectUpdatedAt: project.updatedAt,
  }));
}

export async function loadRecoverySnapshot(id: string): Promise<Project | null> {
  if (!/^snapshot-[0-7]\.json$/.test(id)) throw new Error('Invalid recovery snapshot id');
  const r = await root();
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await r.getDirectoryHandle(SNAPSHOT_DIR);
  } catch {
    return null;
  }

  try {
    const handle = await dir.getFileHandle(id);
    const file = await handle.getFile();
    return migrateProject(JSON.parse(await file.text()));
  } catch (error) {
    console.warn(`Failed to load recovery snapshot ${id}`, error);
    return null;
  }
}

export async function loadRecoveryProject(): Promise<Project | null> {
  const r = await root();
  return loadLatestRecoverySnapshot(r);
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  return navigator.storage.estimate();
}

function serializableProject(project: Project): Project {
  return {
    ...project,
    version: 2,
    updatedAt: new Date().toISOString(),
    assets: project.assets.map(({ objectUrl: _objectUrl, proxyObjectUrl: _proxyObjectUrl, ...asset }) => asset),
  };
}

async function writeSnapshot(r: FileSystemDirectoryHandle, json: string, now: number) {
  const dir = await r.getDirectoryHandle(SNAPSHOT_DIR, { create: true });
  const slot = Math.floor(now / SNAPSHOT_INTERVAL_MS) % SNAPSHOT_COUNT;
  const handle = await dir.getFileHandle(`snapshot-${slot}.json`, { create: true });
  await writeText(handle, json);
}

async function loadLatestRecoverySnapshot(r: FileSystemDirectoryHandle): Promise<Project | null> {
  const entries = await readSnapshotEntries(r);
  return entries[0]?.project ?? null;
}

async function readSnapshotEntries(r: FileSystemDirectoryHandle) {
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await r.getDirectoryHandle(SNAPSHOT_DIR);
  } catch {
    return [] as Array<{ id: string; file: File; project: Project }>;
  }

  const candidates: Array<{ id: string; file: File; project: Project }> = [];
  for (let slot = 0; slot < SNAPSHOT_COUNT; slot += 1) {
    const id = `snapshot-${slot}.json`;
    try {
      const handle = await dir.getFileHandle(id);
      const file = await handle.getFile();
      const project = migrateProject(JSON.parse(await file.text()));
      candidates.push({ id, file, project });
    } catch {
      // Empty or invalid rotating slot. Invalid snapshots are ignored instead of
      // preventing recovery from older valid generations.
    }
  }

  candidates.sort((a, b) => b.file.lastModified - a.file.lastModified);
  return candidates;
}

async function writeText(handle: FileSystemFileHandle, text: string) {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}


function waveformCacheFileName(cacheKey: string) {
  return `waveform-${fnv1a(cacheKey)}-${cacheKey.length}.json`;
}

function thumbnailAssetDirectoryName(assetId: string) {
  return `asset-${fnv1a(assetId)}-${assetId.length}`;
}

function thumbnailCacheFileName(cacheKey: string) {
  return `thumb-${fnv1a(cacheKey)}-${cacheKey.length}.webp`;
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
