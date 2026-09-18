import { assetKindFromFile } from './media';

const DEFAULT_MAX_FILES = 2000;

export interface FolderImportResult {
  files: File[];
  truncated: boolean;
}

export function supportsDirectoryPicker() {
  return typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function';
}

export async function pickMediaFilesFromFolder(maxFiles = DEFAULT_MAX_FILES): Promise<FolderImportResult> {
  if (!supportsDirectoryPicker()) throw new Error('Folder import is not supported by this browser.');
  const handle = await window.showDirectoryPicker!({ mode: 'read' });
  return collectMediaFilesFromDirectory(handle, maxFiles);
}

export async function collectMediaFilesFromDirectory(
  root: FileSystemDirectoryHandle,
  maxFiles = DEFAULT_MAX_FILES,
): Promise<FolderImportResult> {
  const limit = Math.max(1, Math.min(10_000, Math.floor(maxFiles || DEFAULT_MAX_FILES)));
  const collected: Array<{ path: string; file: File }> = [];
  let truncated = false;

  const walk = async (directory: FileSystemDirectoryHandle, prefix: string): Promise<void> => {
    if (collected.length >= limit) {
      truncated = true;
      return;
    }

    const entries: FileSystemHandle[] = [];
    for await (const entry of directory.values()) entries.push(entry);
    entries.sort((a, b) => a.name.localeCompare(b.name, 'ja'));

    for (const entry of entries) {
      if (collected.length >= limit) {
        truncated = true;
        return;
      }
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.kind === 'directory') {
        await walk(entry as FileSystemDirectoryHandle, path);
        continue;
      }

      const file = await (entry as FileSystemFileHandle).getFile();
      if (!assetKindFromFile(file)) continue;
      collected.push({ path, file });
    }
  };

  await walk(root, '');
  collected.sort((a, b) => a.path.localeCompare(b.path, 'ja'));
  return { files: collected.map((entry) => entry.file), truncated };
}

declare global {
  interface Window {
    showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
  }
}
