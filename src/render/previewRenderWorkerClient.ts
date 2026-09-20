import type { Project } from '../types/editor';
import {
  supportsPreviewRenderWorker,
  type PreviewRenderWorkerOptions,
  type PreviewRenderWorkerRequest,
  type PreviewRenderWorkerResponse,
} from './previewRenderWorkerProtocol';

export interface PreviewWorkerFrame {
  bitmap: ImageBitmap;
  width: number;
  height: number;
  frameIndex: number;
  time: number;
  cached: boolean;
}

interface PendingRequest {
  sessionId: number;
  resolve: (frame: PreviewWorkerFrame) => void;
  reject: (error: Error) => void;
  cleanup?: () => void;
}

let worker: Worker | null = null;
let workerFailed = false;
let nextSessionId = 1;
let nextRequestId = 1;
const sessionIds = new Set<number>();
const pending = new Map<number, PendingRequest>();

export function canUsePreviewRenderWorker() {
  return !workerFailed && supportsPreviewRenderWorker();
}

export class PreviewRenderWorkerSession {
  private readonly sessionId: number;
  private closed = false;

  constructor(project: Project, options: PreviewRenderWorkerOptions = {}) {
    if (!canUsePreviewRenderWorker()) throw new Error('Preview render worker is unavailable');
    this.sessionId = nextSessionId++;
    sessionIds.add(this.sessionId);
    try {
      ensureWorker().postMessage({
        kind: 'init',
        sessionId: this.sessionId,
        project,
        options,
      } satisfies PreviewRenderWorkerRequest);
    } catch (error) {
      sessionIds.delete(this.sessionId);
      if (sessionIds.size === 0) disposePreviewRenderWorker();
      throw asError(error);
    }
  }

  frame(timeSeconds: number, signal?: AbortSignal) {
    if (this.closed) return Promise.reject(new Error('Preview render worker session is closed'));
    throwIfAborted(signal);
    const activeWorker = ensureWorker();
    const requestId = nextRequestId++;

    return new Promise<PreviewWorkerFrame>((resolve, reject) => {
      const abort = () => {
        pending.delete(requestId);
        cleanup?.();
        try {
          activeWorker.postMessage({ kind: 'cancel', requestId } satisfies PreviewRenderWorkerRequest);
        } catch {
          // The worker may already be terminated after a crash.
        } finally {
          reject(abortError(signal));
        }
      };
      const cleanup = signal ? () => signal.removeEventListener('abort', abort) : undefined;
      if (signal) signal.addEventListener('abort', abort, { once: true });
      pending.set(requestId, { sessionId: this.sessionId, resolve, reject, cleanup });
      if (signal?.aborted) {
        abort();
        return;
      }
      try {
        activeWorker.postMessage({
          kind: 'render',
          sessionId: this.sessionId,
          requestId,
          timeSeconds,
        } satisfies PreviewRenderWorkerRequest);
      } catch (error) {
        pending.delete(requestId);
        cleanup?.();
        reject(asError(error));
      }
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    sessionIds.delete(this.sessionId);
    for (const [requestId, request] of pending) {
      if (request.sessionId !== this.sessionId) continue;
      pending.delete(requestId);
      request.cleanup?.();
      request.reject(new DOMException('Preview render worker session was closed', 'AbortError'));
    }
    if (worker) {
      try {
        worker.postMessage({ kind: 'dispose', sessionId: this.sessionId } satisfies PreviewRenderWorkerRequest);
      } catch {
        // A failed worker is already released by failWorker.
      }
      if (sessionIds.size === 0) disposePreviewRenderWorker();
    }
  }
}

export function disposePreviewRenderWorker() {
  worker?.terminate();
  worker = null;
  sessionIds.clear();
  rejectPending(new DOMException('Preview render worker was disposed', 'AbortError'));
}

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./previewRenderWorker.ts', import.meta.url), {
    type: 'module',
    name: 'preview-render-worker',
  });
  worker.onmessage = (event: MessageEvent<PreviewRenderWorkerResponse>) => {
    const response = event.data;
    const request = pending.get(response.requestId);
    if (!request) {
      if (response.ok) response.bitmap.close();
      return;
    }
    pending.delete(response.requestId);
    request.cleanup?.();
    if (!response.ok) {
      request.reject(new Error(response.error));
      return;
    }
    request.resolve({
      bitmap: response.bitmap,
      width: response.width,
      height: response.height,
      frameIndex: response.frameIndex,
      time: response.time,
      cached: response.cached,
    });
  };
  worker.onerror = (event) => failWorker(new Error(event.message || 'Preview render worker crashed'));
  worker.onmessageerror = () => failWorker(new Error('Preview render worker returned unreadable data'));
  return worker;
}

function failWorker(error: Error) {
  workerFailed = true;
  worker?.terminate();
  worker = null;
  sessionIds.clear();
  rejectPending(error);
}

function rejectPending(error: Error) {
  for (const request of pending.values()) {
    request.cleanup?.();
    request.reject(error);
  }
  pending.clear();
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw abortError(signal);
}

function abortError(signal?: AbortSignal) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException(typeof signal?.reason === 'string' ? signal.reason : 'Operation aborted', 'AbortError');
}

function asError(error: unknown) {
  return error instanceof Error ? error : new Error(String(error));
}
