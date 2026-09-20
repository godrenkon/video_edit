import type { Project } from '../types/editor';
import {
  canUsePreviewRenderWorker,
  PreviewRenderWorkerSession,
  type PreviewWorkerFrame,
} from './previewRenderWorkerClient';
import type { PreviewRenderWorkerOptions } from './previewRenderWorkerProtocol';

type LocalPreviewCache = import('./previewRenderCache').PreviewRenderCache;

export class PreviewRenderEngine {
  private readonly project: Project;
  private readonly options: PreviewRenderWorkerOptions;
  private workerSession: PreviewRenderWorkerSession | null = null;
  private localCache: Promise<LocalPreviewCache> | null = null;
  private closed = false;

  constructor(project: Project, options: PreviewRenderWorkerOptions = {}) {
    this.project = project;
    this.options = options;
    if (canUsePreviewRenderWorker()) {
      try {
        this.workerSession = new PreviewRenderWorkerSession(project, options);
      } catch (error) {
        console.warn('Preview render worker initialization failed; using the main-thread fallback', error);
      }
    }
  }

  async frame(project: Project, timeSeconds: number, signal?: AbortSignal): Promise<PreviewWorkerFrame> {
    if (this.closed) throw new Error('Preview render engine is closed');
    if (this.workerSession) {
      try {
        return await this.workerSession.frame(timeSeconds, signal);
      } catch (error) {
        if (isAbortError(error, signal)) throw error;
        console.warn('Preview render worker failed; using the main-thread fallback', error);
        this.workerSession.close();
        this.workerSession = null;
      }
    }
    const cache = await this.getLocalCache();
    const frame = await cache.frame(project, timeSeconds, signal);
    return { ...frame, release() {} };
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    this.workerSession?.close();
    this.workerSession = null;
    if (this.localCache) {
      const cache = await this.localCache.catch(() => null);
      if (cache) await cache.close();
    }
    this.localCache = null;
  }

  private getLocalCache() {
    if (!this.localCache) {
      this.localCache = import('./previewRenderCache')
        .then(({ PreviewRenderCache }) => new PreviewRenderCache(this.project, this.options));
    }
    return this.localCache;
  }
}

function isAbortError(error: unknown, signal?: AbortSignal) {
  return signal?.aborted || (error instanceof DOMException && error.name === 'AbortError');
}
