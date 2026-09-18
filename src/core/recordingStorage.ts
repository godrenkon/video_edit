const RECORDING_TEMP_DIR = 'recordings-temp';

export interface RecordingSink {
  readonly fileName: string;
  write(chunk: Blob): Promise<void>;
  close(mimeType: string): Promise<File>;
  abort(): Promise<void>;
}

export function sanitizeRecordingFileName(value: string) {
  const normalized = value.trim().replace(/[^a-zA-Z0-9._-]+/g, '_').replace(/^_+|_+$/g, '');
  return (normalized || 'recording.webm').slice(0, 180);
}

export async function createOpfsRecordingSink(requestedFileName: string): Promise<RecordingSink> {
  if (!navigator.storage?.getDirectory) throw new Error('OPFS is not available');
  const fileName = sanitizeRecordingFileName(requestedFileName);
  const root = await navigator.storage.getDirectory();
  const dir = await root.getDirectoryHandle(RECORDING_TEMP_DIR, { create: true });
  const handle = await dir.getFileHandle(fileName, { create: true });
  const writable = await handle.createWritable();
  let queue: Promise<void> = Promise.resolve();
  let finished = false;
  let firstWriteError: unknown = null;

  const enqueue = (work: () => Promise<void>) => {
    const result = queue.then(work, work);
    void result.catch((error) => {
      if (firstWriteError === null) firstWriteError = error;
    });
    queue = result.then(() => undefined, () => undefined);
    return result;
  };

  return {
    fileName,
    write(chunk: Blob) {
      if (finished) return Promise.reject(new Error('Recording sink is already closed'));
      if (chunk.size <= 0) return Promise.resolve();
      return enqueue(async () => {
        await writable.write(chunk);
      });
    },
    async close(mimeType: string) {
      if (finished) throw new Error('Recording sink is already closed');
      finished = true;
      await queue;
      if (firstWriteError !== null) {
        await writable.abort().catch(() => undefined);
        await dir.removeEntry(fileName).catch(() => undefined);
        throw firstWriteError;
      }
      try {
        await writable.close();
        const stored = await handle.getFile();
        return new File([stored], fileName, {
          type: mimeType || 'application/octet-stream',
          lastModified: stored.lastModified || Date.now(),
        });
      } catch (error) {
        await writable.abort().catch(() => undefined);
        await dir.removeEntry(fileName).catch(() => undefined);
        throw error;
      }
    },
    async abort() {
      if (finished) return;
      finished = true;
      await queue;
      await writable.abort().catch(() => undefined);
      await dir.removeEntry(fileName).catch(() => undefined);
    },
  };
}

export async function deleteTemporaryRecording(fileName: string) {
  if (!navigator.storage?.getDirectory) return;
  try {
    const root = await navigator.storage.getDirectory();
    const dir = await root.getDirectoryHandle(RECORDING_TEMP_DIR);
    await dir.removeEntry(sanitizeRecordingFileName(fileName)).catch(() => undefined);
  } catch {
    // Missing temp recording storage is equivalent to already cleaned up.
  }
}
