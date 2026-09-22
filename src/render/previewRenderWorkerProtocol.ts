import type { Project } from '../types/editor';

export interface PreviewRenderWorkerOptions {
  maxWidth?: number;
  maxHeight?: number;
  maxBytes?: number;
  videoCacheBytes?: number;
}

export type PreviewRenderWorkerRequest =
  | {
      kind: 'init';
      sessionId: number;
      project: Project;
      options: PreviewRenderWorkerOptions;
    }
  | {
      kind: 'render';
      sessionId: number;
      requestId: number;
      timeSeconds: number;
    }
  | { kind: 'cancel'; requestId: number }
  | { kind: 'dispose'; sessionId: number };

export type PreviewRenderWorkerResponse =
  | {
      requestId: number;
      ok: true;
      bitmap: ImageBitmap;
      width: number;
      height: number;
      frameIndex: number;
      time: number;
      cached: boolean;
    }
  | { requestId: number; ok: false; error: string; errorName?: string };

export function supportsPreviewRenderWorker(environment: typeof globalThis = globalThis) {
  return typeof environment.Worker === 'function'
    && typeof environment.OffscreenCanvas === 'function'
    && typeof environment.createImageBitmap === 'function'
    && typeof environment.navigator?.storage?.getDirectory === 'function';
}

export function previewRenderWorkerError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === 'string' && error ? error : 'Preview render worker failed';
}

export function previewRenderWorkerErrorName(error: unknown) {
  return error instanceof Error && error.name ? error.name : undefined;
}
