export type AssetKind = 'video' | 'audio' | 'image';
export type TrackKind = 'video' | 'overlay' | 'audio' | 'subtitle';
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
  hash?: string;
  tags?: string[];
  rating?: number;
  notes?: string;
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
  align?: 'left' | 'center' | 'right';
}

export interface SubtitlePayload {
  text: string;
  speaker?: string;
  words?: Array<{ text: string; start: number; end: number }>;
}

export interface GeneratorPayload {
  kind: 'color' | 'gradient' | 'noise' | 'bars' | 'custom';
  data?: Record<string, EffectParameterValue>;
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
  transform: Transform;
  zundamon?: ZundamonPayload;
  crop?: Crop;
  blendMode?: BlendMode;
  speed?: number;
  reverse?: boolean;
  effects?: EffectInstance[];
  groupId?: string;
  text?: TextPayload;
  subtitle?: SubtitlePayload;
  generator?: GeneratorPayload;
}

export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  muted: boolean;
  locked: boolean;
  solo?: boolean;
  visible?: boolean;
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
  tracks: Track[];
  markers?: TimelineMarker[];
  inPoint?: number;
  outPoint?: number;
}
