import type { Project } from '../types/editor';

export type RenderQueueStatus = 'queued' | 'rendering' | 'completed' | 'failed' | 'canceled';

export interface RenderQueueJob {
  id: string;
  project: Project;
  projectName: string;
  createdAt: string;
  status: RenderQueueStatus;
  progress: number | null;
  error?: string;
}

export function createRenderQueueJob(
  project: Project,
  id: string,
  createdAt = new Date().toISOString(),
): RenderQueueJob {
  return {
    id,
    project: cloneProjectSnapshot(project),
    projectName: project.name || '無題のプロジェクト',
    createdAt,
    status: 'queued',
    progress: null,
  };
}

export function nextQueuedRenderJob(queue: RenderQueueJob[]) {
  return queue.find((job) => job.status === 'queued') ?? null;
}

export function updateRenderQueueJob(
  queue: RenderQueueJob[],
  id: string,
  patch: Partial<Omit<RenderQueueJob, 'id' | 'project' | 'projectName' | 'createdAt'>>,
) {
  return queue.map((job) => job.id === id ? { ...job, ...patch } : job);
}

export function clearFinishedRenderJobs(queue: RenderQueueJob[]) {
  return queue.filter((job) => job.status === 'queued' || job.status === 'rendering');
}

export function renderQueueCounts(queue: RenderQueueJob[]) {
  let queued = 0;
  let running = 0;
  let completed = 0;
  let failed = 0;
  for (const job of queue) {
    if (job.status === 'queued') queued += 1;
    else if (job.status === 'rendering') running += 1;
    else if (job.status === 'completed') completed += 1;
    else if (job.status === 'failed') failed += 1;
  }
  return { queued, running, completed, failed, total: queue.length };
}

function cloneProjectSnapshot(project: Project): Project {
  if (typeof structuredClone === 'function') return structuredClone(project);
  return JSON.parse(JSON.stringify(project)) as Project;
}
