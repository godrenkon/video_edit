export const TIMELINE_THUMBNAIL_WIDTH = 192;
export const TIMELINE_THUMBNAIL_HEIGHT = 108;

export interface MediaThumbnailRequest {
  id: number;
  kind: 'thumbnail';
  assetKey: string;
  blob: Blob;
  timeSeconds: number;
}

export interface MediaWaveformRequest {
  id: number;
  kind: 'waveform';
  assetKey: string;
  blob: Blob;
  duration: number;
  samplesPerSecond: number;
  maxBins: number;
  chunkSeconds: number;
}

export interface MediaCancelRequest {
  kind: 'cancel';
  id: number;
}

export interface MediaClearRequest {
  kind: 'clear';
  assetId?: string;
}

export type MediaAnalysisWorkerRequest =
  | MediaThumbnailRequest
  | MediaWaveformRequest
  | MediaCancelRequest
  | MediaClearRequest;

export type MediaAnalysisWorkerResponse =
  | { id: number; kind: 'thumbnail'; ok: true; blob: Blob | null }
  | { id: number; kind: 'waveform'; ok: true; peaks: number[] }
  | { id: number; kind: 'thumbnail' | 'waveform'; ok: false; error: string };

export function supportsMediaAnalysisWorker(environment: typeof globalThis = globalThis) {
  return typeof environment.Worker === 'function' && typeof environment.OffscreenCanvas === 'function';
}

export function mediaAnalysisWorkerError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === 'string' && error ? error : 'Media analysis worker failed';
}
