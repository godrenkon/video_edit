import { describe, expect, it } from 'vitest';
import type { AssetMeta } from '../types/editor';
import { mergeRelinkedAsset } from './media';

function asset(patch: Partial<AssetMeta> = {}): AssetMeta {
  return {
    id: 'asset-original',
    name: 'Original.mp4',
    kind: 'video',
    mime: 'video/mp4',
    size: 100,
    duration: 10,
    width: 1920,
    height: 1080,
    storageName: 'asset-original.mp4',
    proxyStorageName: 'asset-original.proxy.webm',
    proxyObjectUrl: 'blob:proxy',
    objectUrl: 'blob:original',
    tags: ['B-roll'],
    rating: 5,
    favorite: true,
    notes: 'keep metadata',
    ...patch,
  };
}

describe('asset relink merge', () => {
  it('keeps asset identity and editor metadata while replacing media facts', () => {
    const replacement = asset({
      id: 'temporary',
      name: 'replacement.mp4',
      mime: 'video/webm',
      size: 999,
      duration: 7.5,
      width: 1280,
      height: 720,
      storageName: 'temporary.webm',
      objectUrl: 'blob:replacement',
      proxyStorageName: undefined,
      proxyObjectUrl: undefined,
      tags: [],
      rating: 0,
      favorite: false,
      notes: undefined,
    });

    const merged = mergeRelinkedAsset(asset(), replacement);
    expect(merged).toMatchObject({
      id: 'asset-original',
      name: 'Original.mp4',
      storageName: 'asset-original.mp4',
      mime: 'video/webm',
      size: 999,
      duration: 7.5,
      width: 1280,
      height: 720,
      objectUrl: 'blob:replacement',
      tags: ['B-roll'],
      rating: 5,
      favorite: true,
      notes: 'keep metadata',
    });
    expect(merged.proxyStorageName).toBeUndefined();
    expect(merged.proxyObjectUrl).toBeUndefined();
  });

  it('rejects relinking an asset to a different media kind', () => {
    expect(() => mergeRelinkedAsset(asset(), asset({ kind: 'audio' }))).toThrow('Relink kind mismatch');
  });
});
