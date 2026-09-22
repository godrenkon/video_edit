import type { Project } from '../types/editor';
import { buildAudioMixSegments, ProjectAudioMixer } from './audioMixer';
import { sanitizeRenderFileName } from './opfsRenderTarget';
import type { RenderProgress } from './types';

const WAV_MIME = 'audio/wav';
const WAV_HEADER_BYTES = 44;
const MAX_WAV_DATA_BYTES = 0xffff_ffff - 36;

export interface ProjectWavExportOptions {
  fileName?: string;
  sampleRate?: number;
  channels?: number;
  chunkSeconds?: number;
  preferOpfs?: boolean;
  signal?: AbortSignal;
  onProgress?: (progress: RenderProgress) => void;
}

export interface ProjectWavExportBase {
  fileName: string;
  mimeType: typeof WAV_MIME;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
}

export type ProjectWavExportResult =
  | (ProjectWavExportBase & { storage: 'opfs'; file: File })
  | (ProjectWavExportBase & { storage: 'memory'; blob: Blob });

export async function exportProjectWav(
  project: Project,
  options: ProjectWavExportOptions = {},
): Promise<ProjectWavExportResult> {
  const range = projectAudioRange(project);
  if (range.durationSeconds <= 0) throw new Error('音声書き出し範囲が空です。');
  if (buildAudioMixSegments(project, range.startSeconds, range.endSeconds).length === 0) {
    throw new Error('書き出し範囲に音声クリップがありません。');
  }

  const sampleRate = Math.max(8_000, Math.min(192_000, Math.round(options.sampleRate ?? 48_000)));
  const channels = Math.max(1, Math.min(2, Math.round(options.channels ?? 2)));
  const totalFrames = Math.max(1, Math.round(range.durationSeconds * sampleRate));
  const dataBytes = totalFrames * channels * 2;
  if (dataBytes > MAX_WAV_DATA_BYTES) {
    throw new Error('WAVの4GB上限を超えます。書き出し範囲またはサンプルレートを小さくしてください。');
  }

  const fileName = ensureWavExtension(options.fileName ?? `${project.name || 'audio'}.wav`);
  const chunkFrames = Math.max(1, Math.round(Math.max(0.1, options.chunkSeconds ?? 2) * sampleRate));
  const mixer = new ProjectAudioMixer(project.assets);
  const startedAt = performance.now();

  try {
    if (options.preferOpfs !== false && hasOpfs()) {
      const output = await createOpfsWavWriter(fileName);
      try {
        await output.write(0, createWavHeader(totalFrames, sampleRate, channels));
        await renderPcmChunks({
          project,
          mixer,
          rangeStart: range.startSeconds,
          totalFrames,
          sampleRate,
          channels,
          chunkFrames,
          signal: options.signal,
          onChunk: async (frameOffset, bytes) => output.write(WAV_HEADER_BYTES + frameOffset * channels * 2, bytes),
          onProgress: options.onProgress,
          startedAt,
        });
        await output.close();
        return {
          storage: 'opfs',
          fileName: output.fileName,
          file: await output.getFile(),
          mimeType: WAV_MIME,
          durationSeconds: totalFrames / sampleRate,
          sampleRate,
          channels,
        };
      } catch (error) {
        await output.abort(error);
        await output.remove();
        throw error;
      }
    }

    const chunks: BlobPart[] = [toArrayBuffer(createWavHeader(totalFrames, sampleRate, channels))];
    await renderPcmChunks({
      project,
      mixer,
      rangeStart: range.startSeconds,
      totalFrames,
      sampleRate,
      channels,
      chunkFrames,
      signal: options.signal,
      onChunk: async (_frameOffset, bytes) => { chunks.push(toArrayBuffer(bytes)); },
      onProgress: options.onProgress,
      startedAt,
    });
    return {
      storage: 'memory',
      fileName,
      blob: new Blob(chunks, { type: WAV_MIME }),
      mimeType: WAV_MIME,
      durationSeconds: totalFrames / sampleRate,
      sampleRate,
      channels,
    };
  } finally {
    await mixer.close();
  }
}

export function createWavHeader(totalFrames: number, sampleRate: number, channels: number) {
  const safeFrames = Math.max(0, Math.floor(totalFrames));
  const safeRate = Math.max(1, Math.floor(sampleRate));
  const safeChannels = Math.max(1, Math.min(2, Math.floor(channels)));
  const blockAlign = safeChannels * 2;
  const dataBytes = safeFrames * blockAlign;
  if (dataBytes > MAX_WAV_DATA_BYTES) throw new Error('PCM data exceeds classic WAV size limits');

  const buffer = new ArrayBuffer(WAV_HEADER_BYTES);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, safeChannels, true);
  view.setUint32(24, safeRate, true);
  view.setUint32(28, safeRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);
  return new Uint8Array(buffer);
}

interface ChannelAudioBuffer {
  length: number;
  numberOfChannels: number;
  getChannelData(channel: number): Float32Array;
}

export function audioBufferToPcm16(buffer: ChannelAudioBuffer, channels: number, frameCount = buffer.length) {
  const outputChannels = Math.max(1, Math.min(2, Math.round(channels)));
  const frames = Math.max(0, Math.min(buffer.length, Math.floor(frameCount)));
  const bytes = new Uint8Array(frames * outputChannels * 2);
  const view = new DataView(bytes.buffer);
  let offset = 0;

  for (let frame = 0; frame < frames; frame += 1) {
    for (let channel = 0; channel < outputChannels; channel += 1) {
      const sourceChannel = Math.min(channel, buffer.numberOfChannels - 1);
      const value = clampSample(buffer.getChannelData(sourceChannel)[frame] ?? 0);
      const pcm = value < 0 ? Math.round(value * 32768) : Math.round(value * 32767);
      view.setInt16(offset, pcm, true);
      offset += 2;
    }
  }
  return bytes;
}

function projectAudioRange(project: Project) {
  const projectEnd = Math.max(0, project.duration);
  const startSeconds = clamp(project.inPoint ?? 0, 0, projectEnd);
  const endSeconds = clamp(project.outPoint ?? projectEnd, startSeconds, projectEnd);
  return { startSeconds, endSeconds, durationSeconds: Math.max(0, endSeconds - startSeconds) };
}

async function renderPcmChunks(input: {
  project: Project;
  mixer: ProjectAudioMixer;
  rangeStart: number;
  totalFrames: number;
  sampleRate: number;
  channels: number;
  chunkFrames: number;
  signal?: AbortSignal;
  onChunk: (frameOffset: number, bytes: Uint8Array) => Promise<void>;
  onProgress?: (progress: RenderProgress) => void;
  startedAt: number;
}) {
  let frameOffset = 0;
  while (frameOffset < input.totalFrames) {
    throwIfAborted(input.signal);
    const frames = Math.min(input.chunkFrames, input.totalFrames - frameOffset);
    const startSeconds = input.rangeStart + frameOffset / input.sampleRate;
    const durationSeconds = frames / input.sampleRate;
    const buffer = await input.mixer.renderChunk(input.project, startSeconds, durationSeconds, {
      sampleRate: input.sampleRate,
      channels: input.channels,
      signal: input.signal,
    });
    const bytes = audioBufferToPcm16(buffer, input.channels, frames);
    await input.onChunk(frameOffset, bytes);
    frameOffset += frames;
    input.onProgress?.({
      completedFrames: frameOffset,
      totalFrames: input.totalFrames,
      fraction: frameOffset / input.totalFrames,
      elapsedMs: performance.now() - input.startedAt,
    });
  }
}

async function createOpfsWavWriter(fileName: string) {
  const safeName = ensureWavExtension(fileName);
  const root = await navigator.storage.getDirectory();
  const directory = await root.getDirectoryHandle('renders', { create: true });
  const handle = await directory.getFileHandle(safeName, { create: true });
  const writable = await handle.createWritable({ keepExistingData: false });
  let terminal = false;
  return {
    fileName: safeName,
    write: async (position: number, data: Uint8Array) => {
      if (terminal) throw new Error('WAV output is already closed');
      await writable.write({ type: 'write', position, data: toArrayBuffer(data) });
    },
    close: async () => {
      if (terminal) return;
      terminal = true;
      await writable.close();
    },
    abort: async (reason?: unknown) => {
      if (terminal) return;
      terminal = true;
      await writable.abort(reason).catch(() => undefined);
    },
    getFile: () => handle.getFile(),
    remove: () => directory.removeEntry(safeName).catch(() => undefined),
  };
}

function hasOpfs() {
  const storage = navigator.storage as unknown as {
    getDirectory?: () => Promise<FileSystemDirectoryHandle>;
  };
  return typeof storage.getDirectory === 'function';
}

function ensureWavExtension(fileName: string) {
  const safe = sanitizeRenderFileName(fileName || 'audio.wav').replace(/\.(wav|wave)$/i, '');
  return `${safe || 'audio'}.wav`;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function writeAscii(view: DataView, offset: number, text: string) {
  for (let index = 0; index < text.length; index += 1) view.setUint8(offset + index, text.charCodeAt(index));
}

function clampSample(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(-1, Math.min(1, value));
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  if (signal.reason instanceof Error) throw signal.reason;
  throw new DOMException(typeof signal.reason === 'string' ? signal.reason : 'Operation aborted', 'AbortError');
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
