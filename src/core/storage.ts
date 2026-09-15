import type { Project } from '../types/editor';

const PROJECT_FILE = 'project.json';
const ASSET_DIR = 'assets';

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
  const handle = await r.getFileHandle(PROJECT_FILE, { create: true });
  const writable = await handle.createWritable();
  const safeProject: Project = {
    ...project,
    updatedAt: new Date().toISOString(),
    assets: project.assets.map(({ objectUrl: _objectUrl, ...asset }) => asset),
  };
  await writable.write(JSON.stringify(safeProject, null, 2));
  await writable.close();
}

export async function loadProject(): Promise<Project | null> {
  try {
    const r = await root();
    const handle = await r.getFileHandle(PROJECT_FILE);
    const file = await handle.getFile();
    return JSON.parse(await file.text()) as Project;
  } catch {
    return null;
  }
}

export async function storageEstimate() {
  if (!navigator.storage?.estimate) return null;
  return navigator.storage.estimate();
}
