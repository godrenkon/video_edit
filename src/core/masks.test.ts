import { describe, expect, it } from 'vitest';
import { createClipMask, removeClipMask, sanitizeClipMasks, updateClipMask } from './masks';

describe('clip masks', () => {
  it('sanitizes rectangle and ellipse masks into normalized bounds', () => {
    expect(sanitizeClipMasks([
      { id: 'rect', kind: 'rectangle', x: -1, y: 0.2, width: 5, height: 0.5 },
      { id: 'ellipse', kind: 'ellipse', x: 0.9, y: 0.95, width: 1, height: 1 },
      { id: 'bad', kind: 'polygon', x: 0, y: 0, width: 1, height: 1 },
    ])).toEqual([
      { id: 'rect', kind: 'rectangle', x: 0, y: 0.2, width: 1, height: 0.5 },
      { id: 'ellipse', kind: 'ellipse', x: 0.9, y: 0.95, width: 0.1, height: 0.05 },
    ]);
  });

  it('deduplicates persisted ids and drops empty lists', () => {
    const result = sanitizeClipMasks([
      { id: 'same', kind: 'rectangle', x: 0, y: 0, width: 1, height: 1 },
      { id: 'same', kind: 'ellipse', x: 0, y: 0, width: 1, height: 1 },
    ]);
    expect(result?.[0].id).toBe('same');
    expect(result?.[1].id).toBe('mask_migrated_1');
    expect(sanitizeClipMasks([])).toBeUndefined();
  });

  it('updates geometry safely and removes masks without leaving an empty array', () => {
    const source = [{ id: 'm', kind: 'rectangle' as const, x: 0.1, y: 0.1, width: 0.8, height: 0.8 }];
    const updated = updateClipMask(source, 'm', { x: 0.75, width: 0.8 });
    expect(updated[0]).toMatchObject({ x: 0.75, width: 0.25 });
    expect(removeClipMask(updated, 'm')).toBeUndefined();
  });

  it('creates a centered default mask with a fresh id', () => {
    const mask = createClipMask('ellipse');
    expect(mask.kind).toBe('ellipse');
    expect(mask.id).toMatch(/^mask_/);
    expect(mask).toMatchObject({ x: 0.15, y: 0.15, width: 0.7, height: 0.7 });
  });
});
