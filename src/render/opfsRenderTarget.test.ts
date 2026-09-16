import { describe, expect, it } from 'vitest';
import { sanitizeRenderFileName } from './opfsRenderTarget';

describe('sanitizeRenderFileName', () => {
  it('preserves normal render file names', () => {
    expect(sanitizeRenderFileName('movie-final.webm')).toBe('movie-final.webm');
  });

  it('removes path traversal and invalid file-system characters', () => {
    expect(sanitizeRenderFileName('  folder/movie:final?.webm  ')).toBe('folder-movie_final_.webm');
  });

  it('limits very long file names', () => {
    expect(sanitizeRenderFileName(`${'a'.repeat(250)}.webm`).length).toBe(180);
  });
});
