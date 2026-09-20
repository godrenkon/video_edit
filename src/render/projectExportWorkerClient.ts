import type { Project } from '../types/editor';
import type { ProjectAutoVideoExportOptions, ProjectVideoExportResult } from './projectExporter';
import {
  PROJECT_EXPORT_WORKER_UNAVAILABLE,
  projectExportWorkerUnavailable,
  supportsProjectExportWorker,
  type ProjectExportWorkerRequest,
  type ProjectExportWorkerResponse,
} from './projectExportWorkerProtocol';
import type { RenderProgress } from './types';

interface PendingExport {
  resolve: (result: ProjectVideoExportResult) => void;
  reject: (error: Error) => void;
  onProgress?: (progress: RenderProgress) => void;
  cleanup?: () => void;
}

let worker: Worker | null = null;
let workerFailed = false;
let nextRequestId = 1;
const pending = new Map<number, PendingExport>();
const cancellationTimers = new Map<number, ReturnType<typeof setTimeout>>();

export function canUseProjectExportWorker() {
  return !workerFailed && supportsProjectExportWorker();
}

export function exportProjectVideoInWorker(
  project: Project,
  options: ProjectAutoVideoExportOptions = {},
): Promise<ProjectVideoExportResult> {
  if (!canUseProjectExportWorker()) {
    return Promise.reject(projectExportWorkerUnavailable('Project export worker is unavailable'));
  }
  if (options.signal?.aborted) return Promise.reject(abortError(options.signal));

  let activeWorker: Worker;
  try {
    activeWorker = ensureWorker();
  } catch (error) {
    workerFailed = true;
    return Promise.reject(projectExportWorkerUnavailable(errorMessage(error)));
  }

  const id = nextRequestId++;
  const { signal, onProgress, ...workerOptions } = options;

  return new Promise<ProjectVideoExportResult>((resolve, reject) => {
    const abort = () => {
      const request = pending.get(id);
      if (!request) return;
      pending.delete(id);
      request.cleanup?.();
      try {
        activeWorker.postMessage({ kind: 'cancel', id } satisfies ProjectExportWorkerRequest);
      } catch (error) {
        failWorker(projectExportWorkerUnavailable(errorMessage(error)));
        reject(abortError(signal));
        return;
      }
      reject(abortError(signal));
      const timer = setTimeout(() => {
        cancellationTimers.delete(id);
        if (pending.size === 0) terminateWorker();
      }, 30_000);
      cancellationTimers.set(id, timer);
    };
    const cleanup = signal ? () => signal.removeEventListener('abort', abort) : undefined;
    if (signal) signal.addEventListener('abort', abort, { once: true });
    pending.set(id, { resolve, reject, onProgress, cleanup });

    if (signal?.aborted) {
      abort();
      return;
    }

    try {
      activeWorker.postMessage({
        kind: 'export',
        id,
        project,
        options: workerOptions,
      } satisfies ProjectExportWorkerRequest);
    } catch (error) {
      pending.delete(id);
      cleanup?.();
      reject(projectExportWorkerUnavailable(errorMessage(error)));
      releaseWorkerIfIdle();
    }
  });
}

export function disposeProjectExportWorker() {
  terminateWorker();
  rejectPending(new DOMException('Project export worker was disposed', 'AbortError'));
}

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./projectExportWorker.ts', import.meta.url), {
    type: 'module',
    name: 'project-export-worker',
  });
  worker.onmessage = handleWorkerMessage;
  worker.onerror = (event) => failWorker(projectExportWorkerUnavailable(event.message || 'Project export worker crashed'));
  worker.onmessageerror = () => failWorker(projectExportWorkerUnavailable('Project export worker returned unreadable data'));
  return worker;
}

function handleWorkerMessage(event: MessageEvent<ProjectExportWorkerResponse>) {
  const response = event.data;
  const request = pending.get(response.id);
  if (response.kind === 'progress') {
    request?.onProgress?.(response.progress);
    return;
  }

  clearCancellationTimer(response.id);
  if (!request) {
    releaseWorkerIfIdle();
    return;
  }
  pending.delete(response.id);
  request.cleanup?.();
  if (response.kind === 'error') request.reject(workerResponseError(response.error, response.errorName));
  else request.resolve(response.result);
  releaseWorkerIfIdle();
}

function failWorker(error: Error) {
  workerFailed = true;
  terminateWorker();
  rejectPending(error);
}

function terminateWorker() {
  worker?.terminate();
  worker = null;
  for (const timer of cancellationTimers.values()) clearTimeout(timer);
  cancellationTimers.clear();
}

function releaseWorkerIfIdle() {
  if (pending.size === 0 && cancellationTimers.size === 0) terminateWorker();
}

function rejectPending(error: Error) {
  for (const request of pending.values()) {
    request.cleanup?.();
    request.reject(error);
  }
  pending.clear();
}

function clearCancellationTimer(id: number) {
  const timer = cancellationTimers.get(id);
  if (timer) clearTimeout(timer);
  cancellationTimers.delete(id);
}

function workerResponseError(message: string, name?: string) {
  if (name === 'AbortError') return new DOMException(message, 'AbortError');
  const error = new Error(message);
  if (name) error.name = name;
  return error;
}

function abortError(signal?: AbortSignal) {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException(typeof signal?.reason === 'string' ? signal.reason : 'Project export cancelled', 'AbortError');
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message ? error.message : String(error || PROJECT_EXPORT_WORKER_UNAVAILABLE);
}
