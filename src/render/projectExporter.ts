import { probeCapabilities, type BrowserCapabilityReport, type CodecCapability } from '../core/capabilities';
import type { Project } from '../types/editor';
import { ProjectAudioMixer, buildAudioMixSegments } from './audioMixer';
import { Canvas2DProjectRenderer, type RenderCanvas } from './canvas2dRenderer';
import { sanitizeRenderFileName } from './opfsRenderTarget';
import { RenderAssetStore } from './renderAssetStore';
import type { RenderProgress } from './types';
import {
  renderCanvasToOpfsWebM,
  renderCanvasToWebMBuffer,
  type WebMVideoCodec,
} from './webmWriter';

export interface ProjectRenderRange {
  startSeconds: number;
  endSeconds: number;
  durationSeconds: number;
}

export interface ProjectVideoExportOptions {
  fileName?: string;
  codec?: WebMVideoCodec;
  bitrate?: number;
  includeAudio?: boolean;
  audioBitrate?: number;
  audioChunkSeconds?: number;
  audioSampleRate?: number;
  audioChannels?: number;
  signal?: AbortSignal;
  onProgress?: (progress: RenderProgress) => void;
  capabilities?: BrowserCapabilityReport;
  preferOpfs?: boolean;
}

export type ProjectVideoExportResult =
  | {
      storage: 'opfs';
      fileName: string;
      file: File;
      mimeType: string;
      codec: WebMVideoCodec;
      hasAudio: boolean;
      range: ProjectRenderRange;
    }
  | {
      storage: 'memory';
      fileName: string;
      blob: Blob;
      mimeType: string;
      codec: WebMVideoCodec;
      hasAudio: boolean;
      range: ProjectRenderRange;
    };

export type ProjectWebMExportResult = ProjectVideoExportResult;

export function projectRenderRange(project: Project): ProjectRenderRange {
  const projectEnd = Math.max(0, project.duration);
  const startSeconds = clamp(project.inPoint ?? 0, 0, projectEnd);
  const endSeconds = clamp(project.outPoint ?? projectEnd, startSeconds, projectEnd);
  return {
    startSeconds,
    endSeconds,
    durationSeconds: Math.max(0, endSeconds - startSeconds),
  };
}

export function selectWebMVideoCodec(codecs: CodecCapability[]): WebMVideoCodec | null {
  const supported = new Set(codecs.filter((codec) => codec.encode === 'supported').map((codec) => codec.id));
  if (supported.has('vp9')) return 'vp9';
  if (supported.has('vp8')) return 'vp8';
  if (supported.has('av1')) return 'av1';
  return null;
}

export function canEncodeOpus(codecs: CodecCapability[]) {
  return codecs.some((codec) => codec.id === 'opus' && codec.encode === 'supported');
}

export function projectHasAudibleAudio(project: Project, range = projectRenderRange(project)) {
  return buildAudioMixSegments(project, range.startSeconds, range.endSeconds).length > 0;
}

export function defaultVideoBitrate(width: number, height: number, fps: number) {
  const pixelsPerSecond = Math.max(1, width) * Math.max(1, height) * Math.max(1, fps);
  return Math.round(clamp(pixelsPerSecond * 0.12, 2_000_000, 50_000_000));
}

export async function exportProjectWebM(
  project: Project,
  options: ProjectVideoExportOptions = {},
): Promise<ProjectWebMExportResult> {
  const range = projectRenderRange(project);
  if (range.durationSeconds <= 0) throw new Error('書き出し範囲が空です。');

  const capabilities = options.capabilities ?? await probeCapabilities();
  const codec = options.codec ?? selectWebMVideoCodec(capabilities.videoCodecs);
  if (!codec) throw new Error('このブラウザでは WebM 動画をエンコードできる対応コーデックが見つかりません。');

  const hasAudio = options.includeAudio !== false && projectHasAudibleAudio(project, range);
  if (hasAudio && !canEncodeOpus(capabilities.audioCodecs)) {
    throw new Error('このブラウザでは WebM 音声用の Opus エンコードが利用できません。');
  }

  const canvas = createRenderCanvas(project.width, project.height);
  const assets = new RenderAssetStore(project.assets);
  const audioMixer = hasAudio ? new ProjectAudioMixer(project.assets) : null;
  const renderer = new Canvas2DProjectRenderer(canvas, assets);
  const fileName = ensureWebMExtension(options.fileName ?? `${project.name || 'render'}.webm`);
  const bitrate = options.bitrate ?? defaultVideoBitrate(project.width, project.height, project.fps);
  const audioSampleRate = Math.max(8_000, Math.round(options.audioSampleRate ?? 48_000));
  const renderOptions = {
    canvas,
    width: project.width,
    height: project.height,
    fps: project.fps,
    durationSeconds: range.durationSeconds,
    codec,
    bitrate,
    signal: options.signal,
    onProgress: options.onProgress,
    audio: audioMixer ? {
      codec: 'opus' as const,
      bitrate: options.audioBitrate ?? 160_000,
      chunkSeconds: options.audioChunkSeconds ?? 2,
      sampleRate: audioSampleRate,
      renderChunk: (startSeconds: number, durationSeconds: number, signal?: AbortSignal) => audioMixer.renderChunk(
        project,
        range.startSeconds + startSeconds,
        durationSeconds,
        {
          sampleRate: audioSampleRate,
          channels: options.audioChannels ?? 2,
          signal,
        },
      ),
    } : undefined,
    drawFrame: async (request: { timeSeconds: number }, signal?: AbortSignal) => {
      await renderer.render(project, range.startSeconds + request.timeSeconds, signal);
    },
  };

  try {
    const useOpfs = options.preferOpfs !== false && capabilities.base.opfs;
    if (useOpfs) {
      const result = await renderCanvasToOpfsWebM(fileName, renderOptions);
      return {
        storage: 'opfs',
        fileName: result.fileName,
        file: result.file,
        mimeType: result.mimeType,
        codec,
        hasAudio,
        range,
      };
    }

    const blob = await renderCanvasToWebMBuffer(renderOptions);
    return {
      storage: 'memory',
      fileName: sanitizeRenderFileName(fileName),
      blob,
      mimeType: blob.type || 'video/webm',
      codec,
      hasAudio,
      range,
    };
  } finally {
    await Promise.all([
      assets.close(),
      audioMixer?.close() ?? Promise.resolve(),
    ]);
  }
}

/** Backwards-compatible name retained while callers migrate to exportProjectWebM. */
export const exportProjectVideoWebM = exportProjectWebM;

function createRenderCanvas(width: number, height: number): RenderCanvas {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document === 'undefined') throw new Error('Canvas が利用できません。');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function ensureWebMExtension(fileName: string) {
  const safe = sanitizeRenderFileName(fileName);
  return safe.toLowerCase().endsWith('.webm') ? safe : `${safe}.webm`;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
