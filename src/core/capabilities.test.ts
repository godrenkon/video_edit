import { describe, expect, it } from 'vitest';
import { buildFallbackNotes, type BrowserCapabilityReport } from './capabilities';

function report(overrides: Partial<BrowserCapabilityReport> = {}): BrowserCapabilityReport {
  return {
    detectedAt: '2026-01-01T00:00:00.000Z',
    base: {
      webCodecs: true,
      opfs: true,
      webGpu: true,
      offscreenCanvas: true,
      audioWorklet: true,
      crossOriginIsolated: true,
      sharedArrayBuffer: true,
    },
    storage: { persisted: true, usage: 10, quota: 100 },
    videoCodecs: [
      { id: 'h264', label: 'H.264', decode: 'supported', encode: 'supported' },
      { id: 'vp9', label: 'VP9', decode: 'supported', encode: 'supported' },
    ],
    audioCodecs: [{ id: 'opus', label: 'Opus', decode: 'supported', encode: 'supported' }],
    importMime: [],
    fallbackNotes: [],
    ...overrides,
  };
}

describe('buildFallbackNotes', () => {
  it('returns no fallback notes for a fully supported baseline', () => {
    const value = report();
    expect(buildFallbackNotes(value)).toEqual([]);
  });

  it('describes storage, codec and rendering fallbacks without throwing', () => {
    const value = report({
      base: {
        webCodecs: false,
        opfs: false,
        webGpu: false,
        offscreenCanvas: false,
        audioWorklet: false,
        crossOriginIsolated: false,
        sharedArrayBuffer: true,
      },
      storage: { persisted: false, usage: null, quota: null },
      videoCodecs: [
        { id: 'h264', label: 'H.264', decode: 'unavailable', encode: 'unsupported' },
        { id: 'vp9', label: 'VP9', decode: 'unavailable', encode: 'supported' },
      ],
      audioCodecs: [{ id: 'opus', label: 'Opus', decode: 'unavailable', encode: 'unsupported' }],
    });

    const notes = buildFallbackNotes(value);
    expect(notes.some((note) => note.includes('OPFS'))).toBe(true);
    expect(notes.some((note) => note.includes('WebCodecs'))).toBe(true);
    expect(notes.some((note) => note.includes('WebM/VP9'))).toBe(true);
    expect(notes.some((note) => note.includes('音声エンコーダー'))).toBe(true);
    expect(notes.some((note) => note.includes('WebGPU'))).toBe(true);
    expect(notes.some((note) => note.includes('OffscreenCanvas'))).toBe(true);
    expect(notes.some((note) => note.includes('cross-origin isolation'))).toBe(true);
  });

  it('warns when OPFS exists but persistent storage is not granted', () => {
    const value = report({ storage: { persisted: false, usage: 10, quota: 100 } });
    expect(buildFallbackNotes(value).some((note) => note.includes('永続化されていません'))).toBe(true);
  });
});
