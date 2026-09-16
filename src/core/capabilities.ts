export interface CapabilityReport {
  webCodecs: boolean;
  opfs: boolean;
  webGpu: boolean;
  offscreenCanvas: boolean;
  audioWorklet: boolean;
  crossOriginIsolated: boolean;
  sharedArrayBuffer: boolean;
}

export type CapabilityState = 'supported' | 'unsupported' | 'unavailable' | 'error';

export interface CodecCapability {
  id: string;
  label: string;
  decode: CapabilityState;
  encode: CapabilityState;
}

export interface MimeCapability {
  mime: string;
  support: '' | 'maybe' | 'probably';
}

export interface StorageCapability {
  persisted: boolean | null;
  usage: number | null;
  quota: number | null;
}

export interface BrowserCapabilityReport {
  detectedAt: string;
  base: CapabilityReport;
  storage: StorageCapability;
  videoCodecs: CodecCapability[];
  audioCodecs: CodecCapability[];
  importMime: MimeCapability[];
  fallbackNotes: string[];
}

type CodecProbeApi = {
  isConfigSupported(config: Record<string, unknown>): Promise<{ supported?: boolean }>;
};

type CodecGlobals = typeof globalThis & {
  VideoDecoder?: CodecProbeApi;
  VideoEncoder?: CodecProbeApi;
  AudioDecoder?: CodecProbeApi;
  AudioEncoder?: CodecProbeApi;
};

const VIDEO_TARGETS = [
  {
    id: 'h264',
    label: 'H.264',
    decoder: { codec: 'avc1.42001E', codedWidth: 1280, codedHeight: 720 },
    encoder: { codec: 'avc1.42001E', width: 1280, height: 720, bitrate: 4_000_000, framerate: 30 },
  },
  {
    id: 'vp9',
    label: 'VP9',
    decoder: { codec: 'vp09.00.10.08', codedWidth: 1280, codedHeight: 720 },
    encoder: { codec: 'vp09.00.10.08', width: 1280, height: 720, bitrate: 4_000_000, framerate: 30 },
  },
  {
    id: 'vp8',
    label: 'VP8',
    decoder: { codec: 'vp8', codedWidth: 1280, codedHeight: 720 },
    encoder: { codec: 'vp8', width: 1280, height: 720, bitrate: 4_000_000, framerate: 30 },
  },
  {
    id: 'av1',
    label: 'AV1',
    decoder: { codec: 'av01.0.05M.08', codedWidth: 1280, codedHeight: 720 },
    encoder: { codec: 'av01.0.05M.08', width: 1280, height: 720, bitrate: 4_000_000, framerate: 30 },
  },
] as const;

const AUDIO_TARGETS = [
  {
    id: 'opus',
    label: 'Opus',
    decoder: { codec: 'opus', sampleRate: 48_000, numberOfChannels: 2 },
    encoder: { codec: 'opus', sampleRate: 48_000, numberOfChannels: 2, bitrate: 160_000 },
  },
  {
    id: 'aac',
    label: 'AAC',
    decoder: { codec: 'mp4a.40.2', sampleRate: 48_000, numberOfChannels: 2 },
    encoder: { codec: 'mp4a.40.2', sampleRate: 48_000, numberOfChannels: 2, bitrate: 192_000 },
  },
] as const;

const MIME_TARGETS = [
  'video/webm; codecs="vp9,opus"',
  'video/webm; codecs="vp8,opus"',
  'video/mp4; codecs="avc1.42E01E,mp4a.40.2"',
  'audio/webm; codecs="opus"',
  'audio/ogg; codecs="opus"',
  'audio/mp4; codecs="mp4a.40.2"',
] as const;

export function detectCapabilities(): CapabilityReport {
  const hasWindow = typeof window !== 'undefined';
  const hasNavigator = typeof navigator !== 'undefined';
  const globals = globalThis as CodecGlobals;

  return {
    webCodecs: Boolean(globals.VideoEncoder && globals.VideoDecoder),
    opfs: hasNavigator && typeof navigator.storage?.getDirectory === 'function',
    webGpu: hasNavigator && 'gpu' in navigator,
    offscreenCanvas: typeof OffscreenCanvas !== 'undefined',
    audioWorklet: typeof AudioWorkletNode !== 'undefined',
    crossOriginIsolated: hasWindow && window.crossOriginIsolated === true,
    sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
  };
}

export async function probeCapabilities(): Promise<BrowserCapabilityReport> {
  const base = detectCapabilities();
  const globals = globalThis as CodecGlobals;

  const [storage, videoCodecs, audioCodecs] = await Promise.all([
    probeStorage(),
    Promise.all(VIDEO_TARGETS.map(async (target): Promise<CodecCapability> => ({
      id: target.id,
      label: target.label,
      decode: await probeCodec(globals.VideoDecoder, target.decoder),
      encode: await probeCodec(globals.VideoEncoder, target.encoder),
    }))),
    Promise.all(AUDIO_TARGETS.map(async (target): Promise<CodecCapability> => ({
      id: target.id,
      label: target.label,
      decode: await probeCodec(globals.AudioDecoder, target.decoder),
      encode: await probeCodec(globals.AudioEncoder, target.encoder),
    }))),
  ]);

  const importMime = probeMimeSupport();
  const partial: Omit<BrowserCapabilityReport, 'fallbackNotes'> = {
    detectedAt: new Date().toISOString(),
    base,
    storage,
    videoCodecs,
    audioCodecs,
    importMime,
  };

  return {
    ...partial,
    fallbackNotes: buildFallbackNotes(partial),
  };
}

export function buildFallbackNotes(
  report: Pick<BrowserCapabilityReport, 'base' | 'storage' | 'videoCodecs' | 'audioCodecs'>,
): string[] {
  const notes: string[] = [];
  const { base, storage, videoCodecs, audioCodecs } = report;

  if (!base.opfs) {
    notes.push('OPFS が利用できないため、大容量素材の永続保存は制限されます。');
  } else if (storage.persisted === false) {
    notes.push('ストレージは永続化されていません。ブラウザの容量整理で素材が削除される可能性があります。');
  }

  if (!base.webCodecs) {
    notes.push('WebCodecs が利用できないため、ネイティブのフレーム単位デコード/エンコードは使用できません。');
  }

  const supportedVideoEncoders = videoCodecs.filter((codec) => codec.encode === 'supported');
  if (supportedVideoEncoders.length === 0) {
    notes.push('利用可能な確認済み動画エンコーダーがありません。WASM フォールバックが必要です。');
  }

  const h264 = videoCodecs.find((codec) => codec.id === 'h264');
  const vp9 = videoCodecs.find((codec) => codec.id === 'vp9');
  if (h264?.encode !== 'supported' && vp9?.encode === 'supported') {
    notes.push('H.264 エンコードが使えないため、WebM/VP9 を優先します。');
  }

  if (!audioCodecs.some((codec) => codec.encode === 'supported')) {
    notes.push('利用可能な確認済み音声エンコーダーがありません。音声書き出しにはフォールバックが必要です。');
  }

  if (!base.webGpu) {
    notes.push('WebGPU が利用できないため、合成・エフェクトは WebGL/Canvas/CPU 経路にフォールバックします。');
  }

  if (!base.offscreenCanvas) {
    notes.push('OffscreenCanvas が利用できないため、一部の描画処理をメインスレッドで実行する必要があります。');
  }

  if (base.sharedArrayBuffer && !base.crossOriginIsolated) {
    notes.push('SharedArrayBuffer は存在しますが cross-origin isolation が無効なため、高性能な共有メモリ経路は使用できません。');
  }

  return notes;
}

async function probeStorage(): Promise<StorageCapability> {
  if (typeof navigator === 'undefined' || !navigator.storage) {
    return { persisted: null, usage: null, quota: null };
  }

  let persisted: boolean | null = null;
  let usage: number | null = null;
  let quota: number | null = null;

  try {
    if (typeof navigator.storage.persisted === 'function') {
      persisted = await navigator.storage.persisted();
    }
  } catch {
    persisted = null;
  }

  try {
    if (typeof navigator.storage.estimate === 'function') {
      const estimate = await navigator.storage.estimate();
      usage = typeof estimate.usage === 'number' ? estimate.usage : null;
      quota = typeof estimate.quota === 'number' ? estimate.quota : null;
    }
  } catch {
    usage = null;
    quota = null;
  }

  return { persisted, usage, quota };
}

async function probeCodec(api: CodecProbeApi | undefined, config: Record<string, unknown>): Promise<CapabilityState> {
  if (!api?.isConfigSupported) return 'unavailable';
  try {
    const result = await api.isConfigSupported(config);
    return result.supported === true ? 'supported' : 'unsupported';
  } catch {
    return 'error';
  }
}

function probeMimeSupport(): MimeCapability[] {
  if (typeof document === 'undefined') {
    return MIME_TARGETS.map((mime) => ({ mime, support: '' }));
  }

  const video = document.createElement('video');
  const audio = document.createElement('audio');

  return MIME_TARGETS.map((mime) => {
    const element = mime.startsWith('audio/') ? audio : video;
    const result = element.canPlayType(mime);
    return { mime, support: result === 'probably' || result === 'maybe' ? result : '' };
  });
}
