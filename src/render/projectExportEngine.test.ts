import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Project } from '../types/editor';
import { PROJECT_EXPORT_WORKER_UNAVAILABLE } from './projectExportWorkerProtocol';

const mocks = vi.hoisted(() => ({
  canUseWorker: vi.fn(),
  workerExport: vi.fn(),
  mainExport: vi.fn(),
}));

vi.mock('./projectExportWorkerClient', () => ({
  canUseProjectExportWorker: mocks.canUseWorker,
  exportProjectVideoInWorker: mocks.workerExport,
}));

vi.mock('./projectExporter', () => ({
  exportProjectVideo: mocks.mainExport,
}));

const project = { id: 'project:engine' } as Project;
const result = { storage: 'memory', fileName: 'result.mp4' };

describe('project export engine', () => {
  beforeEach(() => {
    mocks.canUseWorker.mockReset();
    mocks.workerExport.mockReset();
    mocks.mainExport.mockReset();
  });

  it('uses the worker when the complete export runtime is available', async () => {
    mocks.canUseWorker.mockReturnValue(true);
    mocks.workerExport.mockResolvedValue(result);
    const { exportProjectVideo } = await import('./projectExportEngine');

    await expect(exportProjectVideo(project, { preferOpfs: false })).resolves.toBe(result);
    expect(mocks.workerExport).toHaveBeenCalledWith(project, { preferOpfs: false });
    expect(mocks.mainExport).not.toHaveBeenCalled();
  });

  it('falls back only when the worker infrastructure is unavailable', async () => {
    const unavailable = new Error('missing worker API');
    unavailable.name = PROJECT_EXPORT_WORKER_UNAVAILABLE;
    mocks.canUseWorker.mockReturnValue(true);
    mocks.workerExport.mockRejectedValue(unavailable);
    mocks.mainExport.mockResolvedValue(result);
    const { exportProjectVideo } = await import('./projectExportEngine');

    await expect(exportProjectVideo(project)).resolves.toBe(result);
    expect(mocks.mainExport).toHaveBeenCalledWith(project, {});
  });

  it('does not repeat a failed render on the main thread', async () => {
    const renderError = new Error('source frame decode failed');
    mocks.canUseWorker.mockReturnValue(true);
    mocks.workerExport.mockRejectedValue(renderError);
    const { exportProjectVideo } = await import('./projectExportEngine');

    await expect(exportProjectVideo(project)).rejects.toBe(renderError);
    expect(mocks.mainExport).not.toHaveBeenCalled();
  });

  it('uses the main-thread implementation when worker prerequisites are absent', async () => {
    mocks.canUseWorker.mockReturnValue(false);
    mocks.mainExport.mockResolvedValue(result);
    const { exportProjectVideo } = await import('./projectExportEngine');

    await expect(exportProjectVideo(project)).resolves.toBe(result);
    expect(mocks.workerExport).not.toHaveBeenCalled();
  });
});
