import {
  supportsMediaAnalysisWorker,
  type MediaThumbnailRequest,
  type MediaAnalysisWorkerRequest,
  type MediaAnalysisWorkerResponse,
  type MediaWaveformRequest,
} from './mediaAnalysisWorkerProtocol';

type WorkerJobPayload = Omit<MediaThumbnailRequest, 'id'> | Omit<MediaWaveformRequest, 'id'>;

type PendingRequest =
  | { kind: 'thumbnail'; resolve: (blob: Blob | null) => void; reject: (error: Error) => void; cleanup?: () => void }
  | { kind: 'waveform'; resolve: (peaks: number[]) => void; reject: (error: Error) => void; cleanup?: () => void };

let worker: Worker | null = null;
let nextRequestId = 1;
let workerFailed = false;
const pending = new Map<number, PendingRequest>();

export function canUseMediaAnalysisWorker() {
  return !workerFailed && supportsMediaAnalysisWorker();
}

export function renderTimelineThumbnailInWorker(assetKey: string, blob: Blob, timeSeconds: number) {
  return requestWorker<Blob | null>('thumbnail', {
    kind: 'thumbnail',
    assetKey,
    blob,
    timeSeconds,
  });
}

export function analyzeWaveformInWorker(
  assetKey: string,
  blob: Blob,
  options: {
    duration: number;
    samplesPerSecond: number;
    maxBins: number;
    chunkSeconds: number;
    signal?: AbortSignal;
  },
) {
  return requestWorker<number[]>('waveform', {
    kind: 'waveform',
    assetKey,
    blob,
    duration: options.duration,
    samplesPerSecond: options.samplesPerSecond,
    maxBins: options.maxBins,
    chunkSeconds: options.chunkSeconds,
  }, options.signal);
}

export function clearMediaAnalysisWorker(assetId?: string, mediaKind?: 'thumbnail' | 'waveform') {
  if (!worker) return;
  const request: MediaAnalysisWorkerRequest = { kind: 'clear', assetId, mediaKind };
  worker.postMessage(request);
  if (!assetId) disposeMediaAnalysisWorker();
}

export function disposeMediaAnalysisWorker() {
  worker?.terminate();
  worker = null;
  rejectPending(new DOMException('Media analysis worker was disposed', 'AbortError'));
}

function requestWorker<T>(
  kind: PendingRequest['kind'],
  payload: WorkerJobPayload,
  signal?: AbortSignal,
) {
  if (!canUseMediaAnalysisWorker()) return Promise.reject(new Error('Media analysis worker is unavailable'));
  throwIfAborted(signal);
  const activeWorker = ensureWorker();
  const id = nextRequestId++;
  const request = { ...payload, id } as MediaAnalysisWorkerRequest;

  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      pending.delete(id);
      cleanup?.();
      try {
        activeWorker.postMessage({ kind: 'cancel', id } satisfies MediaAnalysisWorkerRequest);
      } catch {
        // The worker may already have crashed or been terminated.
      } finally {
        reject(abortError(signal));
      }
    };
    const cleanup = signal ? () => signal.removeEventListener('abort', abort) : undefined;
    if (signal) signal.addEventListener('abort', abort, { once: true });
    const entry = kind === 'thumbnail'
      ? { kind, resolve: resolve as (blob: Blob | null) => void, reject, cleanup }
      : { kind, resolve: resolve as (peaks: number[]) => void, reject, cleanup };
    pending.set(id, entry as PendingRequest);
    if (signal?.aborted) {
      abort();
      return;
    }
    try {
      activeWorker.postMessage(request);
    } catch (error) {
      pending.delete(id);
      cleanup?.();
      reject(asError(error));
    }
  });
}

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./mediaAnalysisWorker.ts', import.meta.url), {
    type: 'module',
    name: 'media-analysis-worker',
  });
  worker.onmessage = (event: MessageEvent<MediaAnalysisWorkerResponse>) => {
    const response = event.data;
    const request = pending.get(response.id);
    if (!request) return;
    pending.delete(response.id);
    request.cleanup?.();
    if (!response.ok) {
      request.reject(workerResponseError(response.error, response.errorName));
      return;
    }
    if (request.kind !== response.kind) {
      request.reject(new Error('Media analysis worker returned a mismatched response'));
      return;
    }
    if (response.kind === 'thumbnail' && request.kind === 'thumbnail') request.resolve(response.blob);
    else if (response.kind === 'waveform' && request.kind === 'waveform') request.resolve(response.peaks);
  };
  worker.onerror = (event) => failWorker(new Error(event.message || 'Media analysis worker crashed'));
  worker.onmessageerror = () => failWorker(new Error('Media analysis worker returned unreadable data'));
  return worker;
}

function failWorker(error: Error) {
  workerFailed = true;
  worker?.terminate();
  worker = null;
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

function workerResponseError(message: string, name?: string) {
  if (name === 'AbortError') return new DOMException(message, 'AbortError');
  const error = new Error(message);
  if (name) error.name = name;
  return error;
}
