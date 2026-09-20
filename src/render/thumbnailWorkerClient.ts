import {
  supportsTimelineThumbnailWorker,
  type ThumbnailWorkerRequest,
  type ThumbnailWorkerResponse,
} from './thumbnailWorkerProtocol';

interface PendingRequest {
  resolve: (blob: Blob | null) => void;
  reject: (error: Error) => void;
}

let worker: Worker | null = null;
let nextRequestId = 1;
let workerFailed = false;
const pending = new Map<number, PendingRequest>();

export function canRenderTimelineThumbnailInWorker() {
  return !workerFailed && supportsTimelineThumbnailWorker();
}

export function renderTimelineThumbnailInWorker(assetKey: string, blob: Blob, timeSeconds: number) {
  if (!canRenderTimelineThumbnailInWorker()) {
    return Promise.reject(new Error('Timeline thumbnail worker is unavailable'));
  }

  const activeWorker = ensureWorker();
  const id = nextRequestId++;
  const request: ThumbnailWorkerRequest = {
    id,
    kind: 'render',
    assetKey,
    blob,
    timeSeconds,
  };

  return new Promise<Blob | null>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      activeWorker.postMessage(request);
    } catch (error) {
      pending.delete(id);
      reject(asError(error));
    }
  });
}

export function clearTimelineThumbnailWorker(assetId?: string) {
  if (!worker) return;
  const request: ThumbnailWorkerRequest = { kind: 'clear', assetId };
  worker.postMessage(request);
  if (!assetId) disposeTimelineThumbnailWorker();
}

export function disposeTimelineThumbnailWorker() {
  worker?.terminate();
  worker = null;
  rejectPending(new DOMException('Timeline thumbnail worker was disposed', 'AbortError'));
}

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./thumbnailWorker.ts', import.meta.url), {
    type: 'module',
    name: 'timeline-thumbnail-worker',
  });
  worker.onmessage = (event: MessageEvent<ThumbnailWorkerResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    if (response.ok) request.resolve(response.blob);
    else request.reject(new Error(response.error));
  };
  worker.onerror = (event) => {
    const error = new Error(event.message || 'Timeline thumbnail worker crashed');
    workerFailed = true;
    worker?.terminate();
    worker = null;
    rejectPending(error);
  };
  worker.onmessageerror = () => {
    const error = new Error('Timeline thumbnail worker returned unreadable data');
    workerFailed = true;
    worker?.terminate();
    worker = null;
    rejectPending(error);
  };
  return worker;
}

function rejectPending(error: Error) {
  for (const request of pending.values()) request.reject(error);
  pending.clear();
}

function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}
