import { exportProjectVideo, projectHasAudibleAudio, resolveProjectExportOptions } from './projectExporter';
import {
  projectExportWorkerError,
  projectExportWorkerErrorName,
  projectExportWorkerUnavailable,
  type ProjectExportWorkerRequest,
  type ProjectExportWorkerResponse,
} from './projectExportWorkerProtocol';

const active = new Map<number, AbortController>();
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ProjectExportWorkerRequest>) => void) | null;
  postMessage: (response: ProjectExportWorkerResponse) => void;
};

scope.onmessage = (event) => {
  const request = event.data;
  if (request.kind === 'cancel') {
    active.get(request.id)?.abort('Project export cancelled');
    return;
  }

  if (active.has(request.id)) return;
  const controller = new AbortController();
  active.set(request.id, controller);
  void runExport(request, controller)
    .catch((error) => {
      scope.postMessage({
        kind: 'error',
        id: request.id,
        error: projectExportWorkerError(error),
        errorName: projectExportWorkerErrorName(error),
      });
    })
    .finally(() => active.delete(request.id));
};

async function runExport(request: Extract<ProjectExportWorkerRequest, { kind: 'export' }>, controller: AbortController) {
  const effective = resolveProjectExportOptions(request.project, request.options);
  assertWorkerRuntime(request.project, effective.includeAudio !== false);
  const result = await exportProjectVideo(request.project, {
    ...request.options,
    signal: controller.signal,
    onProgress: (progress) => scope.postMessage({ kind: 'progress', id: request.id, progress }),
  });
  if (controller.signal.aborted) throw new DOMException('Project export cancelled', 'AbortError');
  scope.postMessage({ kind: 'complete', id: request.id, result });
}

function assertWorkerRuntime(project: Parameters<typeof projectHasAudibleAudio>[0], includeAudio: boolean) {
  if (typeof OffscreenCanvas !== 'function') {
    throw projectExportWorkerUnavailable('OffscreenCanvas is unavailable in the export worker');
  }
  if (typeof VideoEncoder !== 'function' || typeof VideoDecoder !== 'function') {
    throw projectExportWorkerUnavailable('WebCodecs video APIs are unavailable in the export worker');
  }
  if (typeof navigator.storage?.getDirectory !== 'function') {
    throw projectExportWorkerUnavailable('OPFS is unavailable in the export worker');
  }
  if (includeAudio && projectHasAudibleAudio(project) && typeof AudioBuffer !== 'function') {
    throw projectExportWorkerUnavailable('AudioBuffer is unavailable in the export worker');
  }
}
