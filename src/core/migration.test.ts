import { describe, expect, it } from 'vitest';
import { migrateProject } from './migration';

describe('migrateProject', () => {
  it('migrates a minimal v1 project to the current schema with safe defaults', () => {
    const project = migrateProject({
      version: 1,
      id: 'legacy-project',
      name: 'Legacy',
      width: 1280,
      height: 720,
      fps: 60,
      duration: 12,
      assets: [
        {
          id: 'asset-1',
          name: 'clip.mp4',
          kind: 'video',
          mime: 'video/mp4',
          size: 1000,
          duration: 4,
          storageName: 'asset-1.mp4',
        },
      ],
      tracks: [
        {
          id: 'track-1',
          name: 'Video',
          kind: 'video',
          clips: [
            {
              id: 'clip-1',
              name: 'Clip',
              assetId: 'asset-1',
              start: 1,
              duration: 3,
              inPoint: 0.5,
              volume: 0.8,
              transform: { x: 12, y: -4, scale: 1.2, rotation: 5, opacity: 0.75 },
            },
          ],
        },
      ],
    });

    expect(project.version).toBe(2);
    expect(project.id).toBe('legacy-project');
    expect(project.markers).toEqual([]);
    expect(project.tracks[0]).toMatchObject({ muted: false, locked: false, visible: true, solo: false });
    expect(project.tracks[0].clips[0]).toMatchObject({
      id: 'clip-1',
      kind: 'asset',
      start: 1,
      duration: 3,
      inPoint: 0.5,
      volume: 0.8,
      muted: false,
      transform: {
        x: 12,
        y: -4,
        scale: 1.2,
        rotation: 5,
        opacity: 0.75,
      },
    });
  });

  it('clamps unsafe numeric values while preserving valid optional metadata', () => {
    const project = migrateProject({
      version: 2,
      fps: 999,
      width: 0,
      height: -20,
      duration: 0,
      assets: [],
      tracks: [
        {
          kind: 'video',
          clips: [
            {
              id: 'clip',
              kind: 'asset',
              name: 'Clip',
              start: -10,
              duration: 0,
              inPoint: -5,
              volume: -2,
              muted: false,
              transform: { x: 0, y: 0, scale: -1, rotation: 0, opacity: 7, anchorX: 0.25, anchorY: 0.75 },
            },
          ],
        },
      ],
      markers: [{ id: 'm', time: -3, duration: 2, name: 'Marker' }],
    });

    expect(project.fps).toBe(240);
    expect(project.width).toBe(1);
    expect(project.height).toBe(1);
    expect(project.duration).toBe(0.1);
    expect(project.tracks[0].clips[0]).toMatchObject({
      start: 0,
      duration: 0.1,
      inPoint: 0,
      volume: 0,
      transform: { scale: 0, opacity: 1, anchorX: 0.25, anchorY: 0.75 },
    });
    expect(project.markers?.[0]).toMatchObject({ time: 0, duration: 2 });
  });

  it('rejects unsupported future project versions instead of silently corrupting them', () => {
    expect(() => migrateProject({ version: 99 })).toThrow('Unsupported project version: 99');
  });

  it('rejects non-object project payloads', () => {
    expect(() => migrateProject(null)).toThrow('Project is not an object');
    expect(() => migrateProject([])).toThrow('Project is not an object');
  });
});
