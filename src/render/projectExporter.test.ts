import { describe, expect, it } from 'vitest';
import type { BrowserCapabilityReport, CodecCapability } from '../core/capabilities';
import type { Project } from '../types/editor';
import {
  canEncodeAac,
  canEncodeH264,
  canEncodeOpus,
  defaultVideoBitrate,
  projectHasAudibleAudio,
  projectRenderRange,
  resolveExportDimensions,
  selectPreferredExportContainer,
  selectWebMVideoCodec,
} from './projectExporter';

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

function capabilities(videoCodecs: CodecCapability[], audioCodecs: CodecCapability[]) {
  return { videoCodecs, audioCodecs } satisfies Pick<BrowserCapabilityReport, 'videoCodecs' | 'audioCodecs'>;
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

  it('keeps project dimensions when no export override is supplied', () => {
    expect(resolveExportDimensions(project(), {})).toEqual({ width: 1920, height: 1080 });
  });

  it('preserves aspect ratio when only one export dimension is supplied', () => {
    expect(resolveExportDimensions(project(), { outputWidth: 1280 })).toEqual({ width: 1280, height: 720 });
    expect(resolveExportDimensions(project(), { outputHeight: 2160 })).toEqual({ width: 3840, height: 2160 });
  });

  it('normalizes explicit export dimensions to even encoder-safe values and bounds', () => {
    expect(resolveExportDimensions(project(), { outputWidth: 1279, outputHeight: 719 })).toEqual({ width: 1280, height: 720 });
    expect(resolveExportDimensions(project(), { outputWidth: 99_999, outputHeight: 1 })).toEqual({ width: 8192, height: 16 });
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

  it('checks container-specific audio and video encoders', () => {
    expect(canEncodeOpus([codec('aac', 'supported'), codec('opus', 'unsupported')])).toBe(false);
    expect(canEncodeOpus([codec('opus', 'supported')])).toBe(true);
    expect(canEncodeAac([codec('aac', 'supported')])).toBe(true);
    expect(canEncodeAac([codec('aac', 'unsupported')])).toBe(false);
    expect(canEncodeH264([codec('h264', 'supported')])).toBe(true);
    expect(canEncodeH264([codec('vp9', 'supported')])).toBe(false);
  });

  it('prefers MP4 when H264 and required AAC audio are available', () => {
    const report = capabilities(
      [codec('h264', 'supported'), codec('vp9', 'supported')],
      [codec('aac', 'supported'), codec('opus', 'supported')],
    );
    expect(selectPreferredExportContainer(report, true)).toBe('mp4');
    expect(selectPreferredExportContainer(report, false)).toBe('mp4');
  });

  it('falls back to WebM when MP4 audio support is incomplete', () => {
    const report = capabilities(
      [codec('h264', 'supported'), codec('vp9', 'supported')],
      [codec('aac', 'unsupported'), codec('opus', 'supported')],
    );
    expect(selectPreferredExportContainer(report, true)).toBe('webm');
  });

  it('returns no automatic container when no complete encode path exists', () => {
    const report = capabilities(
      [codec('h264', 'unsupported'), codec('vp9', 'unsupported')],
      [codec('aac', 'supported'), codec('opus', 'supported')],
    );
    expect(selectPreferredExportContainer(report, true)).toBeNull();
  });

  it('detects audible audio inside the render range', () => {
    const withAudio = project({
      assets: [{ id: 'a', name: 'voice', kind: 'audio', mime: 'audio/wav', size: 1, duration: 4, storageName: 'voice.wav' }],
      tracks: [{
        id: 't', name: 'Audio', kind: 'audio', muted: false, locked: false, clips: [{
          id: 'c', kind: 'asset', name: 'voice', assetId: 'a', start: 2, duration: 4, inPoint: 0,
          volume: 1, muted: false, transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
        }],
      }],
    });
    expect(projectHasAudibleAudio(withAudio)).toBe(true);
    withAudio.tracks[0].muted = true;
    expect(projectHasAudibleAudio(withAudio)).toBe(false);
  });

  it('scales default bitrate with resolution and fps while enforcing safe bounds', () => {
    expect(defaultVideoBitrate(1920, 1080, 30)).toBe(7_464_960);
    expect(defaultVideoBitrate(320, 180, 24)).toBe(2_000_000);
    expect(defaultVideoBitrate(7680, 4320, 120)).toBe(50_000_000);
  });
});
