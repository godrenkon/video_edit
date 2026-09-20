export type AssetKind = 'video' | 'audio' | 'image';
export type TrackKind = 'video' | 'overlay' | 'audio' | 'subtitle';
export type AudioBusId = 'master' | 'voice' | 'music' | 'sfx';
export type ClipKind = 'asset' | 'zundamon' | 'text' | 'shape' | 'subtitle' | 'generator';

export type Interpolation = 'hold' | 'linear' | 'bezier';
export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'difference'
  | 'add';

export type EffectParameterValue = number | string | boolean | number[];
export type TransitionKind = 'dissolve' | 'dip-black' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'wipe-left' | 'wipe-right' | 'wipe-up' | 'wipe-down';

export interface ClipTransition {
  kind: TransitionKind;
  duration: number;
}
export type ProjectExportContainer = 'auto' | 'mp4' | 'webm';
export type ProjectExportQuality = 'compact' | 'balanced' | 'high';

export interface ProjectExportSettings {
  container?: ProjectExportContainer;
  outputHeight?: number;
  quality?: ProjectExportQuality;
  includeAudio?: boolean;
}

export interface AssetBin {
  id: string;
  name: string;
}

export interface AssetMeta {
  id: string;
  name: string;
  kind: AssetKind;
  mime: string;
  size: number;
  duration: number;
  width?: number;
  height?: number;
  storageName: string;
  objectUrl?: string;
  proxyStorageName?: string;
  proxyObjectUrl?: string;
  hash?: string;
  tags?: string[];
  rating?: number;
  favorite?: boolean;
  notes?: string;
  binId?: string;
}

export interface Transform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
  anchorX?: number;
  anchorY?: number;
}

export interface Crop {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export type MaskKind = 'rectangle' | 'ellipse';
export type MaskOperation = 'add' | 'subtract' | 'intersect';

export interface ClipMask {
  id: string;
  kind: MaskKind;
  operation: MaskOperation;
  enabled: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  feather: number;
  invert: boolean;
}

export interface Keyframe {
  id: string;
  time: number;
  value: EffectParameterValue;
  interpolation: Interpolation;
  inTangent?: [number, number];
  outTangent?: [number, number];
}

export interface EffectParameter {
  value: EffectParameterValue;
  keyframes?: Keyframe[];
}

export interface EffectInstance {
  id: string;
  kind: string;
  enabled: boolean;
  parameters: Record<string, EffectParameter>;
  maskIds?: string[];
}

export interface TimelineMarker {
  id: string;
  time: number;
  duration?: number;
  name: string;
  color?: string;
  note?: string;
}

export interface TextPayload {
  text: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  color?: string;
  strokeColor?: string;
  strokeWidth?: number;
  backgroundColor?: string;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  align?: 'left' | 'center' | 'right';
}

export interface SubtitlePayload {
  text: string;
  speaker?: string;
  words?: Array<{ text: string; start: number; end: number }>;
  wordHighlight?: boolean;
  highlightColor?: string;
}

export interface TranscriptWord {
  text: string;
  start: number;
  end: number;
  confidence?: number;
}

export interface TranscriptSegment {
  id: string;
  start: number;
  end: number;
  text: string;
  speaker?: string;
  sourceClipId?: string;
  words?: TranscriptWord[];
}

export interface TranscriptDocument {
  id: string;
  source: 'subtitle' | 'voicevox' | 'stt' | 'manual';
  language?: string;
  updatedAt: string;
  segments: TranscriptSegment[];
}

export interface GeneratorPayload {
  kind: 'color' | 'gradient' | 'noise' | 'bars' | 'custom';
  data?: Record<string, EffectParameterValue>;
}

export interface ShapePayload {
  kind: 'rectangle' | 'ellipse' | 'line';
  width: number;
  height: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius?: number;
}

export interface MouthCue {
  time: number;
  state: 0 | 1 | 2;
  vowel?: 'a' | 'i' | 'u' | 'e' | 'o';
}

export interface ZundamonPayload {
  closedAssetId: string;
  halfAssetId?: string;
  openAssetId: string;
  vowelAssetIds?: Partial<Record<'a' | 'i' | 'u' | 'e' | 'o', string>>;
  blinkAssetId?: string;
  audioAssetId: string;
  cues: MouthCue[];
  blinkEvery: number;
  bobAmount: number;
  bobSpeed: number;
  expressionPreset?: string;
}

export interface Clip {
  id: string;
  kind: ClipKind;
  name: string;
  assetId?: string;
  start: number;
  duration: number;
  inPoint: number;
  volume: number;
  muted: boolean;
  fadeIn?: number;
  fadeOut?: number;
  transform: Transform;
  zundamon?: ZundamonPayload;
  crop?: Crop;
  blendMode?: BlendMode;
  speed?: number;
  reverse?: boolean;
  freezeFrameAt?: number;
  transitionIn?: ClipTransition;
  transitionOut?: ClipTransition;
  effects?: EffectInstance[];
  masks?: ClipMask[];
  groupId?: string;
  text?: TextPayload;
  subtitle?: SubtitlePayload;
  generator?: GeneratorPayload;
  shape?: ShapePayload;
}

export interface AudioBusSettings {
  id: AudioBusId;
  gain: number;
  muted: boolean;
}

export interface AudioDuckingSettings {
  enabled: boolean;
  sourceBus: Exclude<AudioBusId, 'master'>;
  targetBus: Exclude<AudioBusId, 'master'>;
  reductionDb: number;
  attack: number;
  release: number;
}

export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  muted: boolean;
  locked: boolean;
  solo?: boolean;
  visible?: boolean;
  gain?: number;
  pan?: number;
  busId?: AudioBusId;
  clips: Clip[];
}

export interface Project {
  version: 1 | 2;
  id: string;
  name: string;
  width: number;
  height: number;
  fps: number;
  background: string;
  duration: number;
  createdAt: string;
  updatedAt: string;
  assets: AssetMeta[];
  assetBins?: AssetBin[];
  tracks: Track[];
  markers?: TimelineMarker[];
  inPoint?: number;
  outPoint?: number;
  exportSettings?: ProjectExportSettings;
  audioBuses?: AudioBusSettings[];
  audioDucking?: AudioDuckingSettings;
  transcript?: TranscriptDocument;
}
