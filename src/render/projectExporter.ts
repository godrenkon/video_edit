import { probeCapabilities, type BrowserCapabilityReport, type CodecCapability } from '../core/capabilities';
import type { Project } from '../types/editor';
import { ProjectAudioMixer, buildAudioMixSegments } from './audioMixer';
import { Canvas2DProjectRenderer, type RenderCanvas } from './canvas2dRenderer';
import { renderCanvasToMp4Buffer, renderCanvasToOpfsMp4 } from './mp4Writer';
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

export type ProjectExportContainer = 'mp4' | 'webm';
export type ProjectExportContainerPreference = ProjectExportContainer | 'auto';

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

export interface ProjectAutoVideoExportOptions extends ProjectVideoExportOptions {
  container?: ProjectExportContainerPreference;
}

interface ProjectVideoExportResultBase {
  fileName: string;
  mimeType: string;
  hasAudio: boolean;
  range: ProjectRenderRange;
  container: ProjectExportContainer;
  codec: WebMVideoCodec | 'h264';
}

export type ProjectVideoExportResult =
  | (ProjectVideoExportResultBase & {
      storage: 'opfs';
      file: File;
    })
  | (ProjectVideoExportResultBase & {
      storage: 'memory';
      blob: Blob;
    });

export type ProjectWebMExportResult = ProjectVideoExportResult & { container: 'webm'; codec: WebMVideoCodec };
export type ProjectMp4ExportResult = ProjectVideoExportResult & { container: 'mp4'; codec: 'h264' };

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

export function canEncodeAac(codecs: CodecCapability[]) {
  return codecs.some((codec) => codec.id === 'aac' && codec.encode === 'supported');
}

export function canEncodeH264(codecs: CodecCapability[]) {
  return codecs.some((codec) => codec.id === 'h264' && codec.encode === 'supported');
}

export function selectPreferredExportContainer(
  capabilities: Pick<BrowserCapabilityReport, 'videoCodecs' | 'audioCodecs'>,
  hasAudio: boolean,
): ProjectExportContainer | null {
  const mp4Ready = canEncodeH264(capabilities.videoCodecs) && (!hasAudio || canEncodeAac(capabilities.audioCodecs));
  if (mp4Ready) return 'mp4';

  const webmReady = selectWebMVideoCodec(capabilities.videoCodecs) !== null
    && (!hasAudio || canEncodeOpus(capabilities.audioCodecs));
  if (webmReady) return 'webm';
  return null;
}

export function projectHasAudibleAudio(project: Project, range = projectRenderRange(project)) {
  return buildAudioMixSegments(project, range.startSeconds, range.endSeconds).length > 0;
}

export function defaultVideoBitrate(width: number, height: number, fps: number) {
  const pixelsPerSecond = Math.max(1, width) * Math.max(1, height) * Math.max(1, fps);
  return Math.round(clamp(pixelsPerSecond * 0.12, 2_000_000, 50_000_000));
}

export async function exportProjectVideo(
  project: Project,
  options: ProjectAutoVideoExportOptions = {},
): Promise<ProjectVideoExportResult> {
  const capabilities = options.capabilities ?? await probeCapabilities();
  const range = projectRenderRange(project);
  if (range.durationSeconds <= 0) throw new Error('書き出し範囲が空です。');
  const hasAudio = options.includeAudio !== false && projectHasAudibleAudio(project, range);

  let container: ProjectExportContainer | null;
  if (options.container && options.container !== 'auto') container = options.container;
  else container = selectPreferredExportContainer(capabilities, hasAudio);

  if (!container) {
    throw new Error('このブラウザでは利用可能な動画書き出し形式が見つかりません。H.264/AAC または WebM 用コーデックを確認してください。');
  }

  const shared = { ...options, capabilities };
  if (container === 'mp4') return exportProjectMp4(project, shared);
  return exportProjectWebM(project, shared);
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

  const context = createProjectRenderContext(project, options, hasAudio);
  const renderOptions = {
    canvas: context.canvas,
    width: project.width,
    height: project.height,
    fps: project.fps,
    durationSeconds: range.durationSeconds,
    codec,
    bitrate: context.bitrate,
    signal: options.signal,
    onProgress: options.onProgress,
    audio: context.audioMixer ? {
      codec: 'opus' as const,
      bitrate: options.audioBitrate ?? 160_000,
      chunkSeconds: options.audioChunkSeconds ?? 2,
      sampleRate: context.audioSampleRate,
      renderChunk: context.renderAudioChunk,
    } : undefined,
    drawFrame: context.drawFrame,
  };
  const fileName = ensureExtension(options.fileName ?? `${project.name || 'render'}.webm`, '.webm');

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
        container: 'webm',
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
      container: 'webm',
      hasAudio,
      range,
    };
  } finally {
    await context.close();
  }
}

export async function exportProjectMp4(
  project: Project,
  options: ProjectVideoExportOptions = {},
): Promise<ProjectMp4ExportResult> {
  const range = projectRenderRange(project);
  if (range.durationSeconds <= 0) throw new Error('書き出し範囲が空です。');

  const capabilities = options.capabilities ?? await probeCapabilities();
  if (!canEncodeH264(capabilities.videoCodecs)) {
    throw new Error('このブラウザでは MP4 用の H.264 エンコードが利用できません。');
  }

  const hasAudio = options.includeAudio !== false && projectHasAudibleAudio(project, range);
  if (hasAudio && !canEncodeAac(capabilities.audioCodecs)) {
    throw new Error('このブラウザでは MP4 音声用の AAC エンコードが利用できません。');
  }

  const context = createProjectRenderContext(project, options, hasAudio);
  const renderOptions = {
    canvas: context.canvas,
    width: project.width,
    height: project.height,
    fps: project.fps,
    durationSeconds: range.durationSeconds,
    bitrate: context.bitrate,
    signal: options.signal,
    onProgress: options.onProgress,
    audio: context.audioMixer ? {
      codec: 'aac' as const,
      bitrate: options.audioBitrate ?? 192_000,
      chunkSeconds: options.audioChunkSeconds ?? 2,
      sampleRate: context.audioSampleRate,
      renderChunk: context.renderAudioChunk,
    } : undefined,
    drawFrame: context.drawFrame,
  };
  const fileName = ensureExtension(options.fileName ?? `${project.name || 'render'}.mp4`, '.mp4');

  try {
    const useOpfs = options.preferOpfs !== false && capabilities.base.opfs;
    if (useOpfs) {
      const result = await renderCanvasToOpfsMp4(fileName, renderOptions);
      return {
        storage: 'opfs',
        fileName: result.fileName,
        file: result.file,
        mimeType: result.mimeType,
        codec: 'h264',
        container: 'mp4',
        hasAudio,
        range,
      };
    }

    const blob = await renderCanvasToMp4Buffer(renderOptions);
    return {
      storage: 'memory',
      fileName: sanitizeRenderFileName(fileName),
      blob,
      mimeType: blob.type || 'video/mp4',
      codec: 'h264',
      container: 'mp4',
      hasAudio,
      range,
    };
  } finally {
    await context.close();
  }
}

function createProjectRenderContext(project: Project, options: ProjectVideoExportOptions, hasAudio: boolean) {
  const range = projectRenderRange(project);
  const canvas = createRenderCanvas(project.width, project.height);
  const assets = new RenderAssetStore(project.assets);
  const audioMixer = hasAudio ? new ProjectAudioMixer(project.assets) : null;
  const renderer = new Canvas2DProjectRenderer(canvas, assets);
  const bitrate = options.bitrate ?? defaultVideoBitrate(project.width, project.height, project.fps);
  const audioSampleRate = Math.max(8_000, Math.round(options.audioSampleRate ?? 48_000));

  const renderAudioChunk = (startSeconds: number, durationSeconds: number, signal?: AbortSignal) => {
    if (!audioMixer) throw new Error('Audio mixer is not available');
    return audioMixer.renderChunk(
      project,
      range.startSeconds + startSeconds,
      durationSeconds,
      {
        sampleRate: audioSampleRate,
        channels: options.audioChannels ?? 2,
        signal,
      },
    );
  };

  const drawFrame = async (request: { timeSeconds: number }, signal?: AbortSignal) => {
    await renderer.render(project, range.startSeconds + request.timeSeconds, signal);
  };

  return {
    canvas,
    assets,
    audioMixer,
    bitrate,
    audioSampleRate,
    renderAudioChunk,
    drawFrame,
    close: async () => {
      await Promise.all([
        assets.close(),
        audioMixer?.close() ?? Promise.resolve(),
      ]);
    },
  };
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

function ensureExtension(fileName: string, extension: '.webm' | '.mp4') {
  const safe = sanitizeRenderFileName(fileName);
  const withoutKnownExtension = safe.replace(/\.(webm|mp4)$/i, '');
  return `${withoutKnownExtension || 'render'}${extension}`;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
