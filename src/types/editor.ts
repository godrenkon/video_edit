export type AssetKind = 'video' | 'audio' | 'image';
export type TrackKind = 'video' | 'overlay' | 'audio';
export type ClipKind = 'asset' | 'zundamon';

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
}

export interface Transform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

export interface MouthCue {
  time: number;
  state: 0 | 1 | 2;
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
}

export interface Track {
  id: string;
  name: string;
  kind: TrackKind;
  muted: boolean;
  locked: boolean;
  clips: Clip[];
}

export interface Project {
  version: 1;
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
}
