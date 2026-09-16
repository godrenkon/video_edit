export interface FrameDimensions {
  width: number;
  height: number;
}

export interface RenderFrameRequest extends FrameDimensions {
  frameIndex: number;
  timeSeconds: number;
  durationSeconds: number;
  timestampUs: number;
  durationUs: number;
}

export interface AudioSegment {
  startSeconds: number;
  durationSeconds: number;
  sampleRate: number;
  numberOfChannels: number;
  channels: Float32Array[];
}

export interface RenderLayer<TFrame = unknown> {
  clipId: string;
  trackId: string;
  zIndex: number;
  opacity: number;
  frame: TFrame;
}

export interface MediaFrameProvider<TFrame = unknown> {
  open(signal?: AbortSignal): Promise<void> | void;
  getFrame(request: RenderFrameRequest, signal?: AbortSignal): Promise<TFrame | null>;
  close(): Promise<void> | void;
}

export interface AudioSegmentProvider {
  open(signal?: AbortSignal): Promise<void> | void;
  getSegment(startSeconds: number, durationSeconds: number, signal?: AbortSignal): Promise<AudioSegment | null>;
  close(): Promise<void> | void;
}

export interface PreviewCompositor<TFrame = unknown, TOutput = unknown> {
  compose(request: RenderFrameRequest, layers: RenderLayer<TFrame>[], signal?: AbortSignal): Promise<TOutput>;
  close(): Promise<void> | void;
}

export interface VideoEncodeSettings extends FrameDimensions {
  codec: string;
  bitrate: number;
  fps: number;
}

export interface AudioEncodeSettings {
  codec: string;
  bitrate: number;
  sampleRate: number;
  numberOfChannels: number;
}

export interface EncoderAdapter<TVideoFrame = unknown> {
  configureVideo(settings: VideoEncodeSettings): Promise<void> | void;
  configureAudio(settings: AudioEncodeSettings): Promise<void> | void;
  encodeVideo(frame: TVideoFrame, request: RenderFrameRequest, keyFrame?: boolean): Promise<void> | void;
  encodeAudio(segment: AudioSegment): Promise<void> | void;
  flush(): Promise<void>;
  close(): Promise<void> | void;
}

export interface EncodedChunkLike {
  type: 'key' | 'delta' | 'audio';
  timestampUs: number;
  durationUs?: number;
  data: Uint8Array;
}

export interface MuxerAdapter {
  addVideoChunk(chunk: EncodedChunkLike): Promise<void> | void;
  addAudioChunk(chunk: EncodedChunkLike): Promise<void> | void;
  finalize(): Promise<Blob>;
  close(): Promise<void> | void;
}

export interface RenderProgress {
  completedFrames: number;
  totalFrames: number;
  fraction: number;
  elapsedMs: number;
}

export interface OfflineRenderer<TOutput = Blob> {
  render(signal?: AbortSignal, onProgress?: (progress: RenderProgress) => void): Promise<TOutput>;
  close(): Promise<void> | void;
}
