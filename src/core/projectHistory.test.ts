import { describe, expect, it } from 'vitest';
import type { Project } from '../types/editor';
import { HistoryController } from './history';
import {
  captureProjectRuntimeUrls,
  forgetAssetRuntimeUrls,
  restoreProjectRuntimeUrls,
  snapshotProjectForHistory,
  type AssetRuntimeUrlRegistry,
} from './projectHistory';

function project(): Project {
  return {
    version: 2,
    id: 'project',
    name: 'History',
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#000000',
    duration: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    assets: [{
      id: 'asset:1',
      name: 'clip.mp4',
      kind: 'video',
      mime: 'video/mp4',
      size: 100,
      duration: 1,
      storageName: 'source.mp4',
      objectUrl: 'blob:source',
      proxyStorageName: 'proxy.mp4',
      proxyObjectUrl: 'blob:proxy',
    }],
    tracks: [],
    markers: [],
  };
}

describe('project history runtime URLs', () => {
  it('removes object URLs from history snapshots', () => {
    const snapshot = snapshotProjectForHistory(project());
    expect(snapshot.assets[0].objectUrl).toBeUndefined();
    expect(snapshot.assets[0].proxyObjectUrl).toBeUndefined();
    expect(snapshot.assets[0].storageName).toBe('source.mp4');
  });

  it('deep clones metadata so later mutations cannot corrupt an older history generation', () => {
    const current = project();
    current.tracks = [{
      id: 'track:1',
      name: 'Video 1',
      kind: 'video',
      locked: false,
      muted: false,
      hidden: false,
      clips: [],
    }];
    const snapshot = snapshotProjectForHistory(current);

    current.tracks[0].name = 'mutated';
    current.assets[0].name = 'mutated.mp4';

    expect(snapshot.tracks[0].name).toBe('Video 1');
    expect(snapshot.assets[0].name).toBe('clip.mp4');
  });

  it('reattaches compatible runtime URLs after undo or redo', () => {
    const current = project();
    const registry: AssetRuntimeUrlRegistry = new Map();
    captureProjectRuntimeUrls(current, registry);

    const restored = restoreProjectRuntimeUrls(snapshotProjectForHistory(current), registry);
    expect(restored.assets[0].objectUrl).toBe('blob:source');
    expect(restored.assets[0].proxyObjectUrl).toBe('blob:proxy');
  });

  it('restores an imported asset URL after undo then redo without storing the URL in history', () => {
    const registry: AssetRuntimeUrlRegistry = new Map();
    const history = new HistoryController<Project>(120, 750, snapshotProjectForHistory);
    const initial = { ...project(), assets: [] };
    const imported = project();

    history.record(initial, 'import');
    captureProjectRuntimeUrls(imported, registry);

    const undone = history.undo(imported);
    expect(undone?.value.assets).toHaveLength(0);

    const redone = history.redo(undone!.value);
    expect(redone?.value.assets[0].objectUrl).toBeUndefined();

    const restored = restoreProjectRuntimeUrls(redone!.value, registry);
    expect(restored.assets[0].objectUrl).toBe('blob:source');
    expect(restored.assets[0].proxyObjectUrl).toBe('blob:proxy');
  });

  it('does not attach stale URLs after storage identity changes', () => {
    const current = project();
    const registry: AssetRuntimeUrlRegistry = new Map();
    captureProjectRuntimeUrls(current, registry);

    const relinked = snapshotProjectForHistory(current);
    relinked.assets[0] = {
      ...relinked.assets[0],
      storageName: 'replacement.mp4',
      proxyStorageName: 'replacement-proxy.mp4',
    };
    const restored = restoreProjectRuntimeUrls(relinked, registry);
    expect(restored.assets[0].objectUrl).toBeUndefined();
    expect(restored.assets[0].proxyObjectUrl).toBeUndefined();
  });

  it('can explicitly forget revoked asset URLs', () => {
    const registry: AssetRuntimeUrlRegistry = new Map();
    captureProjectRuntimeUrls(project(), registry);
    forgetAssetRuntimeUrls(registry, 'asset:1');
    expect(registry.has('asset:1')).toBe(false);
  });
});
