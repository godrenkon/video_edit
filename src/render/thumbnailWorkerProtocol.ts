export const TIMELINE_THUMBNAIL_WIDTH = 192;
export const TIMELINE_THUMBNAIL_HEIGHT = 108;

export interface ThumbnailWorkerRenderRequest {
  id: number;
  kind: 'render';
  assetKey: string;
  blob: Blob;
  timeSeconds: number;
}

export interface ThumbnailWorkerClearRequest {
  kind: 'clear';
  assetId?: string;
}

export type ThumbnailWorkerRequest = ThumbnailWorkerRenderRequest | ThumbnailWorkerClearRequest;

export type ThumbnailWorkerResponse =
  | { id: number; ok: true; blob: Blob | null }
  | { id: number; ok: false; error: string };

export function supportsTimelineThumbnailWorker(environment: typeof globalThis = globalThis) {
  return typeof environment.Worker === 'function' && typeof environment.OffscreenCanvas === 'function';
}

export function thumbnailWorkerError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === 'string' && error ? error : 'Timeline thumbnail worker failed';
}
