import { expect, it } from 'vitest';
import type { Project } from '../types/editor';
import { saveProject } from './storage';

function project(name: string): Project {
  return {
    version: 2,
    id: 'project',
    name,
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#000000',
    duration: 10,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    assets: [],
    tracks: [],
    markers: [],
  };
}

it('serializes overlapping saves so an older slow write cannot replace a newer project', async () => {
  const files = new Map<string, string>();
  let projectWrite = 0;

  const fileHandle = (path: string) => ({
    async createWritable() {
      let staged = '';
      return {
        async write(value: unknown) {
          staged = String(value);
        },
        async close() {
          if (path === 'project.json') {
            projectWrite += 1;
            if (projectWrite === 1) {
              await new Promise((resolve) => setTimeout(resolve, 20));
            }
          }
          files.set(path, staged);
        },
      };
    },
  });

  const snapshotDirectory = {
    async getFileHandle(name: string) {
      return fileHandle(`snapshots/${name}`);
    },
  };

  const rootDirectory = {
    async getDirectoryHandle(name: string) {
      if (name !== 'snapshots') throw new Error(`Unexpected directory: ${name}`);
      return snapshotDirectory;
    },
    async getFileHandle(name: string) {
      return fileHandle(name);
    },
  };

  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: {
      storage: {
        getDirectory: async () => rootDirectory,
      },
    },
  });

  const older = saveProject(project('older'));
  const newer = saveProject(project('newer'));
  await Promise.all([older, newer]);

  expect(projectWrite).toBe(2);
  expect(JSON.parse(files.get('project.json')!).name).toBe('newer');
});
