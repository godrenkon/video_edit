export const TIMELINE_THUMBNAIL_WIDTH = 192;
export const TIMELINE_THUMBNAIL_HEIGHT = 108;
export type MediaAnalysisKind = 'thumbnail' | 'waveform';

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
  mediaKind?: MediaAnalysisKind;
}

export type MediaAnalysisWorkerRequest =
  | MediaThumbnailRequest
  | MediaWaveformRequest
  | MediaCancelRequest
  | MediaClearRequest;

export type MediaAnalysisWorkerResponse =
  | { id: number; kind: 'thumbnail'; ok: true; blob: Blob | null }
  | { id: number; kind: 'waveform'; ok: true; peaks: number[] }
  | { id: number; kind: 'thumbnail' | 'waveform'; ok: false; error: string; errorName?: string };

export function supportsMediaAnalysisWorker(environment: typeof globalThis = globalThis) {
  return typeof environment.Worker === 'function' && typeof environment.OffscreenCanvas === 'function';
}

export function mediaAnalysisWorkerError(error: unknown) {
  if (error instanceof Error && error.message) return error.message;
  return typeof error === 'string' && error ? error : 'Media analysis worker failed';
}

export function mediaAnalysisWorkerErrorName(error: unknown) {
  return error instanceof Error && error.name ? error.name : undefined;
}

export function mediaAnalysisClearMatches(
  request: MediaClearRequest,
  assetKey: string,
  mediaKind: MediaAnalysisKind,
) {
  const assetMatches = !request.assetId || assetKey.startsWith(`${request.assetId}:`);
  const kindMatches = !request.mediaKind || request.mediaKind === mediaKind;
  return assetMatches && kindMatches;
}
