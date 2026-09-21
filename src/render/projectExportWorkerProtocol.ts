import type { Project } from '../types/editor';
import type {
  ProjectAutoVideoExportOptions,
  ProjectVideoExportResult,
} from './projectExporter';
import type { RenderProgress } from './types';

export type ProjectExportWorkerOptions = Omit<ProjectAutoVideoExportOptions, 'signal' | 'onProgress'>;

export type ProjectExportWorkerRequest =
  | {
      kind: 'export';
      id: number;
      project: Project;
      options: ProjectExportWorkerOptions;
    }
  | { kind: 'cancel'; id: number };

export type ProjectExportWorkerResponse =
  | { kind: 'progress'; id: number; progress: RenderProgress }
  | { kind: 'complete'; id: number; result: ProjectVideoExportResult }
  | { kind: 'error'; id: number; error: string; errorName?: string };

export const PROJECT_EXPORT_WORKER_UNAVAILABLE = 'ProjectExportWorkerUnavailableError';

export function supportsProjectExportWorker(environment: typeof globalThis = globalThis) {
  const codecEnvironment = environment as typeof globalThis & {
    AudioEncoder?: unknown;
    AudioDecoder?: unknown;
    VideoEncoder?: unknown;
    VideoDecoder?: unknown;
  };
  return typeof environment.Worker === 'function'
    && typeof environment.OffscreenCanvas === 'function'
    && typeof codecEnvironment.VideoEncoder === 'function'
    && typeof codecEnvironment.VideoDecoder === 'function'
    && typeof environment.navigator?.storage?.getDirectory === 'function';
}

export function projectExportWorkerError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === 'string' && error ? error : 'Project export worker failed';
}

export function projectExportWorkerErrorName(error: unknown) {
  return error instanceof Error && error.name ? error.name : undefined;
}

export function projectExportWorkerUnavailable(message: string) {
  const error = new Error(message);
  error.name = PROJECT_EXPORT_WORKER_UNAVAILABLE;
  return error;
}
