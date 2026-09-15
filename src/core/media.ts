import type { AssetKind, AssetMeta } from '../types/editor';
import { uid } from './project';

export function assetKindFromFile(file: File): AssetKind | null {
  if (file.type.startsWith('video/')) return 'video';
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('image/')) return 'image';
  return null;
}

function mediaMetadata(url: string, kind: 'video' | 'audio') {
  return new Promise<{ duration: number; width?: number; height?: number }>((resolve, reject) => {
    const el = document.createElement(kind === 'video' ? 'video' : 'audio');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      resolve({
        duration: Number.isFinite(el.duration) ? el.duration : 0,
        width: el instanceof HTMLVideoElement ? el.videoWidth : undefined,
        height: el instanceof HTMLVideoElement ? el.videoHeight : undefined,
      });
      el.removeAttribute('src');
      el.load();
    };
    el.onerror = () => reject(new Error(`Failed to read metadata for ${url}`));
    el.src = url;
  });
}

async function imageMetadata(url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => reject(new Error(`Failed to read image metadata for ${url}`));
    img.src = url;
  });
}

export async function buildAssetMeta(file: File): Promise<AssetMeta> {
  const kind = assetKindFromFile(file);
  if (!kind) throw new Error(`Unsupported media type: ${file.type || file.name}`);
  const id = uid('asset');
  const objectUrl = URL.createObjectURL(file);
  let duration = kind === 'image' ? 5 : 0;
  let width: number | undefined;
  let height: number | undefined;

  if (kind === 'image') {
    const m = await imageMetadata(objectUrl);
    width = m.width;
    height = m.height;
  } else {
    const m = await mediaMetadata(objectUrl, kind);
    duration = Math.max(0.1, m.duration || 0.1);
    width = m.width;
    height = m.height;
  }

  return {
    id,
    name: file.name,
    kind,
    mime: file.type,
    size: file.size,
    duration,
    width,
    height,
    storageName: `${id}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`,
    objectUrl,
  };
}

export async function analyzeMouthCues(file: Blob) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error('Web Audio API is not available');
  const ctx = new AudioCtx();
  try {
    const buffer = await file.arrayBuffer();
    const decoded = await ctx.decodeAudioData(buffer.slice(0));
    const channel = decoded.getChannelData(0);
    const windowMs = 45;
    const step = Math.max(1, Math.floor(decoded.sampleRate * windowMs / 1000));
    const raw: { time: number; rms: number }[] = [];
    let peak = 0;

    for (let i = 0; i < channel.length; i += step) {
      const end = Math.min(channel.length, i + step);
      let sum = 0;
      for (let j = i; j < end; j++) sum += channel[j] * channel[j];
      const rms = Math.sqrt(sum / Math.max(1, end - i));
      peak = Math.max(peak, rms);
      raw.push({ time: i / decoded.sampleRate, rms });
    }

    const silence = Math.max(0.008, peak * 0.07);
    const open = Math.max(0.025, peak * 0.28);
    return raw.map(({ time, rms }) => ({
      time,
      state: (rms < silence ? 0 : rms < open ? 1 : 2) as 0 | 1 | 2,
    }));
  } finally {
    await ctx.close();
  }
}

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
