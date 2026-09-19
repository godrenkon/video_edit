import { describe, expect, it } from 'vitest';
import { createProject } from '../core/project';
import {
  clearFinishedRenderJobs,
  createRenderQueueJob,
  nextQueuedRenderJob,
  renderQueueCounts,
  updateRenderQueueJob,
} from './renderQueue';

describe('render queue', () => {
  it('creates an isolated project snapshot', () => {
    const project = createProject();
    project.name = 'Queue test';
    const job = createRenderQueueJob(project, 'job-1', '2026-09-19T00:00:00.000Z');
    project.name = 'Changed later';
    project.tracks[0].name = 'Changed track';

    expect(job.projectName).toBe('Queue test');
    expect(job.project.name).toBe('Queue test');
    expect(job.project.tracks[0].name).not.toBe('Changed track');
    expect(job.status).toBe('queued');
    expect(job.progress).toBeNull();
  });

  it('selects the first queued job and ignores finished jobs', () => {
    const project = createProject();
    const a = { ...createRenderQueueJob(project, 'a'), status: 'completed' as const };
    const b = createRenderQueueJob(project, 'b');
    const c = createRenderQueueJob(project, 'c');
    expect(nextQueuedRenderJob([a, b, c])?.id).toBe('b');
  });

  it('updates one job without mutating the queue', () => {
    const project = createProject();
    const queue = [createRenderQueueJob(project, 'a'), createRenderQueueJob(project, 'b')];
    const next = updateRenderQueueJob(queue, 'b', { status: 'rendering', progress: 0.25 });

    expect(queue[1].status).toBe('queued');
    expect(next[0]).toBe(queue[0]);
    expect(next[1]).not.toBe(queue[1]);
    expect(next[1].status).toBe('rendering');
    expect(next[1].progress).toBe(0.25);
  });

  it('clears terminal jobs and summarizes states', () => {
    const project = createProject();
    const queued = createRenderQueueJob(project, 'q');
    const running = { ...createRenderQueueJob(project, 'r'), status: 'rendering' as const };
    const done = { ...createRenderQueueJob(project, 'd'), status: 'completed' as const };
    const failed = { ...createRenderQueueJob(project, 'f'), status: 'failed' as const };

    expect(clearFinishedRenderJobs([queued, running, done, failed]).map((job) => job.id)).toEqual(['q', 'r']);
    expect(renderQueueCounts([queued, running, done, failed])).toEqual({
      queued: 1,
      running: 1,
      completed: 1,
      failed: 1,
      total: 4,
    });
  });
});
