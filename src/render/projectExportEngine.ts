import type { Project } from '../types/editor';
import type { ProjectAutoVideoExportOptions, ProjectVideoExportResult } from './projectExporter';
import { canUseProjectExportWorker, exportProjectVideoInWorker } from './projectExportWorkerClient';
import { PROJECT_EXPORT_WORKER_UNAVAILABLE } from './projectExportWorkerProtocol';

export type { ProjectAutoVideoExportOptions, ProjectVideoExportResult } from './projectExporter';

export async function exportProjectVideo(
  project: Project,
  options: ProjectAutoVideoExportOptions = {},
): Promise<ProjectVideoExportResult> {
  if (canUseProjectExportWorker()) {
    try {
      return await exportProjectVideoInWorker(project, options);
    } catch (error) {
      if (isAbortError(error, options.signal)) throw error;
      if (!isWorkerUnavailable(error)) throw error;
      console.warn('Project export worker is unavailable; using the main-thread fallback', error);
    }
  }

  const exporter = await import('./projectExporter');
  return exporter.exportProjectVideo(project, options);
}

function isAbortError(error: unknown, signal?: AbortSignal) {
  return signal?.aborted || (error instanceof Error && error.name === 'AbortError');
}

function isWorkerUnavailable(error: unknown) {
  return error instanceof Error && error.name === PROJECT_EXPORT_WORKER_UNAVAILABLE;
}
