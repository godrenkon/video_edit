import { describe, expect, it } from 'vitest';
import type { CodecCapability } from '../core/capabilities';
import type { Project } from '../types/editor';
import { defaultVideoBitrate, projectRenderRange, selectWebMVideoCodec } from './projectExporter';

function project(patch: Partial<Project> = {}): Project {
  return {
    version: 2,
    id: 'project',
    name: 'Export test',
    width: 1920,
    height: 1080,
    fps: 30,
    background: '#000000',
    duration: 20,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    assets: [],
    tracks: [],
    markers: [],
    ...patch,
  };
}

function codec(id: string, encode: CodecCapability['encode']): CodecCapability {
  return { id, label: id, decode: 'supported', encode };
}

describe('project export planning', () => {
  it('uses the full project when no in/out range is set', () => {
    expect(projectRenderRange(project())).toEqual({
      startSeconds: 0,
      endSeconds: 20,
      durationSeconds: 20,
    });
  });

  it('clamps in/out points into a safe ordered render range', () => {
    expect(projectRenderRange(project({ inPoint: 5, outPoint: 14 }))).toEqual({
      startSeconds: 5,
      endSeconds: 14,
      durationSeconds: 9,
    });
    expect(projectRenderRange(project({ inPoint: -3, outPoint: 99 }))).toEqual({
      startSeconds: 0,
      endSeconds: 20,
      durationSeconds: 20,
    });
    expect(projectRenderRange(project({ inPoint: 18, outPoint: 10 }))).toEqual({
      startSeconds: 18,
      endSeconds: 18,
      durationSeconds: 0,
    });
  });

  it('prefers broadly useful WebM codecs in VP9, VP8, AV1 order', () => {
    expect(selectWebMVideoCodec([
      codec('av1', 'supported'),
      codec('vp8', 'supported'),
      codec('vp9', 'supported'),
    ])).toBe('vp9');
    expect(selectWebMVideoCodec([codec('vp9', 'unsupported'), codec('vp8', 'supported')])).toBe('vp8');
    expect(selectWebMVideoCodec([codec('av1', 'supported')])).toBe('av1');
    expect(selectWebMVideoCodec([codec('vp9', 'unsupported')])).toBeNull();
  });

  it('scales default bitrate with resolution and fps while enforcing safe bounds', () => {
    expect(defaultVideoBitrate(1920, 1080, 30)).toBe(7_464_960);
    expect(defaultVideoBitrate(320, 180, 24)).toBe(2_000_000);
    expect(defaultVideoBitrate(7680, 4320, 120)).toBe(50_000_000);
  });
});
