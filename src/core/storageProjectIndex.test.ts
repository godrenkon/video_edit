import { describe, expect, it } from 'vitest';
import { normalizeProjectIndex, type StoredProjectInfo } from './storage';

function info(id: string, name: string, updatedAt: string): StoredProjectInfo {
  return {
    id,
    name,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt,
    width: 1920,
    height: 1080,
    fps: 30,
    duration: 60,
  };
}

describe('multi-project storage catalog', () => {
  it('deduplicates by id and keeps the newest metadata', () => {
    const result = normalizeProjectIndex([
      info('a', 'Old', '2026-01-01T00:00:00.000Z'),
      info('a', 'New', '2026-02-01T00:00:00.000Z'),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('New');
  });

  it('sorts projects by most recently updated first', () => {
    const result = normalizeProjectIndex([
      info('a', 'A', '2026-01-01T00:00:00.000Z'),
      info('b', 'B', '2026-03-01T00:00:00.000Z'),
      info('c', 'C', '2026-02-01T00:00:00.000Z'),
    ]);
    expect(result.map((entry) => entry.id)).toEqual(['b', 'c', 'a']);
  });

  it('drops invalid empty project ids without mutating input', () => {
    const original = [
      info('', 'Invalid', '2026-04-01T00:00:00.000Z'),
      info('ok', 'Valid', '2026-01-01T00:00:00.000Z'),
    ];
    const result = normalizeProjectIndex(original);
    expect(result.map((entry) => entry.id)).toEqual(['ok']);
    expect(original).toHaveLength(2);
  });
});
