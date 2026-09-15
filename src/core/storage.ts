import type { Project } from '../types/editor';
import { migrateProject } from './migration';

const PROJECT_FILE = 'project.json';
const ASSET_DIR = 'assets';
const SNAPSHOT_DIR = 'snapshots';
const SNAPSHOT_COUNT = 8;
const SNAPSHOT_INTERVAL_MS = 30_000;
let lastSnapshotAt = 0;

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
    assets: project.assets.map(({ objectUrl: _objectUrl, ...asset }) => asset),
  };
}

async function writeSnapshot(r: FileSystemDirectoryHandle, json: string, now: number) {
  const dir = await r.getDirectoryHandle(SNAPSHOT_DIR, { create: true });
  const slot = Math.floor(now / SNAPSHOT_INTERVAL_MS) % SNAPSHOT_COUNT;
  const handle = await dir.getFileHandle(`snapshot-${slot}.json`, { create: true });
  await writeText(handle, json);
}

async function loadLatestRecoverySnapshot(r: FileSystemDirectoryHandle): Promise<Project | null> {
  let dir: FileSystemDirectoryHandle;
  try {
    dir = await r.getDirectoryHandle(SNAPSHOT_DIR);
  } catch {
    return null;
  }

  const candidates: File[] = [];
  for (let slot = 0; slot < SNAPSHOT_COUNT; slot += 1) {
    try {
      const handle = await dir.getFileHandle(`snapshot-${slot}.json`);
      candidates.push(await handle.getFile());
    } catch {
      // Empty rotating slot.
    }
  }

  candidates.sort((a, b) => b.lastModified - a.lastModified);
  for (const file of candidates) {
    try {
      return migrateProject(JSON.parse(await file.text()));
    } catch {
      // Try the next older snapshot.
    }
  }
  return null;
}

async function writeText(handle: FileSystemFileHandle, text: string) {
  const writable = await handle.createWritable();
  await writable.write(text);
  await writable.close();
}
