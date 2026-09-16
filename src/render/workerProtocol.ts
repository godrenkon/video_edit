import type { RenderFrameRequest, RenderProgress } from './types';

export type RenderWorkerRequest =
  | { type: 'init'; jobId: string; fps: number; width: number; height: number }
  | { type: 'frame'; jobId: string; request: RenderFrameRequest }
  | { type: 'cancel'; jobId: string; reason?: string }
  | { type: 'dispose'; jobId: string };

export type RenderWorkerResponse =
  | { type: 'ready'; jobId: string }
  | { type: 'frame-complete'; jobId: string; frameIndex: number; progress?: RenderProgress }
  | { type: 'cancelled'; jobId: string; reason?: string }
  | { type: 'error'; jobId: string; message: string; recoverable: boolean };

export function isRenderWorkerRequest(value: unknown): value is RenderWorkerRequest {
  if (!isRecord(value) || typeof value.type !== 'string' || typeof value.jobId !== 'string') return false;

  switch (value.type) {
    case 'init':
      return isPositiveFinite(value.fps) && isPositiveInteger(value.width) && isPositiveInteger(value.height);
    case 'frame':
      return isRenderFrameRequest(value.request);
    case 'cancel':
      return value.reason === undefined || typeof value.reason === 'string';
    case 'dispose':
      return true;
    default:
      return false;
  }
}

function isRenderFrameRequest(value: unknown): value is RenderFrameRequest {
  if (!isRecord(value)) return false;
  return Number.isSafeInteger(value.frameIndex)
    && Number(value.frameIndex) >= 0
    && isPositiveFinite(value.width)
    && isPositiveFinite(value.height)
    && isNonNegativeFinite(value.timeSeconds)
    && isPositiveFinite(value.durationSeconds)
    && isNonNegativeFinite(value.timestampUs)
    && isPositiveFinite(value.durationUs);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveFinite(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function isNonNegativeFinite(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isPositiveInteger(value: unknown) {
  return Number.isSafeInteger(value) && Number(value) > 0;
}
