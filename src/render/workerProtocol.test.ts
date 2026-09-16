import { describe, expect, it } from 'vitest';
import { RenderClock } from './clock';
import { isRenderWorkerRequest } from './workerProtocol';

describe('render worker protocol validation', () => {
  it('accepts valid init, frame, cancel and dispose messages', () => {
    const request = new RenderClock(30).frameRequest(3, { width: 1920, height: 1080 });

    expect(isRenderWorkerRequest({ type: 'init', jobId: 'job', fps: 30, width: 1920, height: 1080 })).toBe(true);
    expect(isRenderWorkerRequest({ type: 'frame', jobId: 'job', request })).toBe(true);
    expect(isRenderWorkerRequest({ type: 'cancel', jobId: 'job', reason: 'user' })).toBe(true);
    expect(isRenderWorkerRequest({ type: 'dispose', jobId: 'job' })).toBe(true);
  });

  it('rejects malformed worker messages before they reach the render engine', () => {
    expect(isRenderWorkerRequest(null)).toBe(false);
    expect(isRenderWorkerRequest({ type: 'init', jobId: 'job', fps: 0, width: 1920, height: 1080 })).toBe(false);
    expect(isRenderWorkerRequest({ type: 'frame', jobId: 'job', request: { frameIndex: -1 } })).toBe(false);
    expect(isRenderWorkerRequest({ type: 'cancel', jobId: 123 })).toBe(false);
    expect(isRenderWorkerRequest({ type: 'unknown', jobId: 'job' })).toBe(false);
  });
});
