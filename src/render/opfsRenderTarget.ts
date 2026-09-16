import { StreamTarget, type StreamTargetChunk } from 'mediabunny';

const RENDER_DIR = 'renders';

export interface OpfsRenderTarget {
  fileName: string;
  target: StreamTarget;
  getFile(): Promise<File>;
  remove(): Promise<void>;
}

/**
 * Creates a random-access Mediabunny StreamTarget backed by OPFS.
 *
 * Container writers may rewrite earlier byte ranges while finalizing headers,
 * therefore chunks are written at their explicit positions instead of being
 * blindly concatenated.
 */
export async function createOpfsRenderTarget(fileName: string): Promise<OpfsRenderTarget> {
  if (!navigator.storage?.getDirectory) throw new Error('OPFS is not available');
  const safeName = sanitizeRenderFileName(fileName);
  const root = await navigator.storage.getDirectory();
  const directory = await root.getDirectoryHandle(RENDER_DIR, { create: true });
  const fileHandle = await directory.getFileHandle(safeName, { create: true });
  const writable = await fileHandle.createWritable({ keepExistingData: false });
  let terminal = false;

  const stream = new WritableStream<StreamTargetChunk>({
    async write(chunk) {
      if (terminal) throw new Error('Render output stream is already closed');
      await writable.write({
        type: 'write',
        position: chunk.position,
        data: chunk.data,
      });
    },
    async close() {
      if (terminal) return;
      terminal = true;
      await writable.close();
    },
    async abort(reason) {
      if (terminal) return;
      terminal = true;
      await writable.abort(reason).catch(() => undefined);
    },
  });

  return {
    fileName: safeName,
    target: new StreamTarget(stream),
    getFile: () => fileHandle.getFile(),
    remove: async () => {
      if (!terminal) {
        terminal = true;
        await writable.abort().catch(() => undefined);
      }
      await directory.removeEntry(safeName).catch(() => undefined);
    },
  };
}

export function sanitizeRenderFileName(fileName: string) {
  const trimmed = fileName.trim();
  const withoutPath = trimmed.replace(/[\\/]+/g, '-');
  const safe = withoutPath.replace(/[\u0000-\u001f<>:"|?*]+/g, '_').replace(/\.+$/g, '').trim();
  if (!safe || safe === '.' || safe === '..') return `render-${Date.now()}.webm`;
  return safe.slice(0, 180);
}
