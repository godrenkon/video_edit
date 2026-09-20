import { PreviewRenderCache } from './previewRenderCache';
import {
  previewRenderWorkerError,
  type PreviewRenderWorkerRequest,
  type PreviewRenderWorkerResponse,
} from './previewRenderWorkerProtocol';
import type { Project } from '../types/editor';

interface PreviewSession {
  project: Project;
  cache: PreviewRenderCache;
}

const sessions = new Map<number, PreviewSession>();
const active = new Map<number, { sessionId: number; controller: AbortController }>();
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<PreviewRenderWorkerRequest>) => void) | null;
  postMessage: (response: PreviewRenderWorkerResponse, transfer?: Transferable[]) => void;
};

scope.onmessage = (event) => {
  const request = event.data;
  if (request.kind === 'init') {
    const previous = sessions.get(request.sessionId);
    if (previous) void previous.cache.close();
    sessions.set(request.sessionId, {
      project: request.project,
      cache: new PreviewRenderCache(request.project, request.options),
    });
    return;
  }
  if (request.kind === 'cancel') {
    active.get(request.requestId)?.controller.abort('Preview frame cancelled');
    return;
  }
  if (request.kind === 'dispose') {
    disposeSession(request.sessionId);
    return;
  }

  const controller = new AbortController();
  active.set(request.requestId, { sessionId: request.sessionId, controller });
  void renderFrame(request.sessionId, request.requestId, request.timeSeconds, controller.signal)
    .then((response) => {
      if (!response) return;
      scope.postMessage(response, [response.bitmap]);
    })
    .catch((error) => {
      if (controller.signal.aborted) return;
      scope.postMessage({ requestId: request.requestId, ok: false, error: previewRenderWorkerError(error) });
    })
    .finally(() => active.delete(request.requestId));
};

async function renderFrame(sessionId: number, requestId: number, timeSeconds: number, signal: AbortSignal) {
  const session = sessions.get(sessionId);
  if (!session) throw new Error('Preview render session is unavailable');
  const frame = await session.cache.frame(session.project, timeSeconds, signal);
  throwIfAborted(signal);
  if (sessions.get(sessionId) !== session) throw new DOMException('Preview render session was replaced', 'AbortError');
  const bitmap = await createImageBitmap(frame.bitmap);
  if (signal.aborted || sessions.get(sessionId) !== session) {
    bitmap.close();
    throwIfAborted(signal);
    throw new DOMException('Preview render session was replaced', 'AbortError');
  }
  return {
    requestId,
    ok: true,
    bitmap,
    width: frame.width,
    height: frame.height,
    frameIndex: frame.frameIndex,
    time: frame.time,
    cached: frame.cached,
  } satisfies PreviewRenderWorkerResponse;
}

function disposeSession(sessionId: number) {
  for (const request of active.values()) {
    if (request.sessionId === sessionId) request.controller.abort('Preview render session disposed');
  }
  const session = sessions.get(sessionId);
  sessions.delete(sessionId);
  if (session) void session.cache.close();
}

function throwIfAborted(signal: AbortSignal) {
  if (!signal.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException(typeof signal.reason === 'string' ? signal.reason : 'Operation aborted', 'AbortError');
}
