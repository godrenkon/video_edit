import { describe, expect, it } from 'vitest';
import type { Project } from '../types/editor';
import { addAssetBin, assignAssetBin, normalizeAssetBinName, removeAssetBin, renameAssetBin } from './assetBins';

function project(): Project {
  return {
    version: 2,
    id: 'p',
    name: 'p',
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#000000',
    duration: 10,
    createdAt: '',
    updatedAt: '',
    assets: [
      { id: 'a', name: 'A', kind: 'video', mime: 'video/mp4', size: 1, duration: 1, storageName: 'a.mp4' },
      { id: 'b', name: 'B', kind: 'audio', mime: 'audio/wav', size: 1, duration: 1, storageName: 'b.wav' },
    ],
    tracks: [],
  };
}

describe('asset bins', () => {
  it('normalizes compact reusable names', () => {
    expect(normalizeAssetBinName('  B-roll   Main\n')).toBe('B-roll Main');
  });

  it('creates unique bins and ignores blank or duplicate names', () => {
    const first = addAssetBin(project(), 'B-roll');
    expect(first.assetBins).toHaveLength(1);
    expect(addAssetBin(first, ' B-roll ')).toBe(first);
    expect(addAssetBin(first, '   ')).toBe(first);
  });

  it('assigns assets only to existing bins', () => {
    const withBin = addAssetBin(project(), 'Voice');
    const binId = withBin.assetBins![0].id;
    const assigned = assignAssetBin(withBin, 'b', binId);
    expect(assigned.assets.find((asset) => asset.id === 'b')?.binId).toBe(binId);
    expect(assignAssetBin(assigned, 'b', 'missing').assets.find((asset) => asset.id === 'b')?.binId).toBeUndefined();
  });

  it('renames bins without allowing duplicates', () => {
    const input = addAssetBin(addAssetBin(project(), 'A'), 'B');
    const [a, b] = input.assetBins!;
    expect(renameAssetBin(input, a.id, 'Primary').assetBins?.[0].name).toBe('Primary');
    expect(renameAssetBin(input, b.id, 'A')).toBe(input);
  });

  it('deleting a bin safely unfiles every assigned asset', () => {
    const withBin = addAssetBin(project(), 'Voice');
    const binId = withBin.assetBins![0].id;
    const assigned = assignAssetBin(assignAssetBin(withBin, 'a', binId), 'b', binId);
    const removed = removeAssetBin(assigned, binId);
    expect(removed.assetBins).toEqual([]);
    expect(removed.assets.every((asset) => asset.binId === undefined)).toBe(true);
  });
});
