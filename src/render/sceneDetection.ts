import { readAssetFile } from '../core/storage';
import type { AssetMeta, Project, TimelineMarker } from '../types/editor';
import { MediabunnyVideoProvider } from './mediabunnyProvider';

export interface SceneDetectionOptions {
  sampleInterval?: number;
  threshold?: number;
  minSceneDuration?: number;
  analysisWidth?: number;
  histogramBins?: number;
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
  readBlob?: (asset: AssetMeta) => Promise<Blob>;
}

export interface FrameSignature {
  bins: number;
  histogram: Float32Array;
}

export interface SceneCandidate {
  time: number;
  score: number;
}

export const AUTO_SCENE_NOTE_PREFIX = 'auto-scene:';

export async function detectSceneCandidates(
  asset: AssetMeta,
  options: SceneDetectionOptions = {},
): Promise<SceneCandidate[]> {
  if (asset.kind !== 'video' || !Number.isFinite(asset.duration) || asset.duration <= 0) return [];

  const interval = clamp(options.sampleInterval ?? 0.5, 0.1, 10);
  const threshold = clamp(options.threshold ?? 0.24, 0.02, 1);
  const minSceneDuration = clamp(options.minSceneDuration ?? 0.8, interval, 60);
  const analysisWidth = Math.round(clamp(options.analysisWidth ?? 64, 16, 256));
  const histogramBins = Math.round(clamp(options.histogramBins ?? 16, 4, 64));
  const blob = await (options.readBlob ?? defaultReadBlob)(asset);
  throwIfAborted(options.signal);

  const provider = new MediabunnyVideoProvider(blob, { maxCacheSize: 8 * 1024 * 1024 });
  await provider.open(options.signal);

  const aspect = asset.width && asset.height && asset.width > 0 && asset.height > 0
    ? asset.height / asset.width
    : 9 / 16;
  const analysisHeight = Math.max(9, Math.round(analysisWidth * aspect));
  const canvas = createAnalysisCanvas(analysisWidth, analysisHeight);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || !('getImageData' in context)) {
    provider.close();
    throw new Error('シーン解析用Canvas 2Dが利用できません。');
  }

  const sampleCount = Math.max(1, Math.ceil(asset.duration / interval));
  const candidates: SceneCandidate[] = [];
  let previous: FrameSignature | null = null;
  let lastAccepted = -Infinity;

  try {
    for (let index = 0; index < sampleCount; index += 1) {
      throwIfAborted(options.signal);
      const time = Math.min(
        Math.max(0, asset.duration - 1 / 1000),
        index * interval,
      );
      const sample = await provider.getFrameAt(time, options.signal);
      if (!sample) continue;
      try {
        context.save();
        context.resetTransform();
        context.globalAlpha = 1;
        context.globalCompositeOperation = 'copy';
        context.filter = 'none';
        context.clearRect(0, 0, analysisWidth, analysisHeight);
        sample.draw(context, 0, 0, sample.displayWidth, sample.displayHeight, 0, 0, analysisWidth, analysisHeight);
        context.restore();

        const signature = frameSignature(
          context.getImageData(0, 0, analysisWidth, analysisHeight),
          histogramBins,
        );
        if (previous) {
          const score = signatureDistance(previous, signature);
          if (score >= threshold && time - lastAccepted >= minSceneDuration) {
            candidates.push({ time: stableTime(time), score });
            lastAccepted = time;
          }
        }
        previous = signature;
      } finally {
        sample.close();
      }
      options.onProgress?.((index + 1) / sampleCount);
    }
  } finally {
    provider.close();
  }

  return candidates;
}

export function frameSignature(image: ImageData, bins = 16): FrameSignature {
  const safeBins = Math.max(4, Math.min(64, Math.round(bins)));
  const histogram = new Float32Array(safeBins * 3);
  const pixels = Math.max(1, image.width * image.height);
  const data = image.data;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] / 255;
    if (alpha <= 0) continue;
    const redBin = Math.min(safeBins - 1, Math.floor(data[index] / 256 * safeBins));
    const greenBin = Math.min(safeBins - 1, Math.floor(data[index + 1] / 256 * safeBins));
    const blueBin = Math.min(safeBins - 1, Math.floor(data[index + 2] / 256 * safeBins));
    histogram[redBin] += alpha;
    histogram[safeBins + greenBin] += alpha;
    histogram[safeBins * 2 + blueBin] += alpha;
  }

  const scale = 1 / pixels;
  for (let index = 0; index < histogram.length; index += 1) histogram[index] *= scale;
  return { bins: safeBins, histogram };
}

export function signatureDistance(a: FrameSignature, b: FrameSignature) {
  if (a.bins !== b.bins || a.histogram.length !== b.histogram.length) return 1;
  let distance = 0;
  for (let index = 0; index < a.histogram.length; index += 1) {
    distance += Math.abs(a.histogram[index] - b.histogram[index]);
  }
  // Each RGB histogram contributes at most an L1 distance of 2. Dividing by
  // six normalizes the aggregate score to approximately 0..1.
  return clamp(distance / 6, 0, 1);
}

export function sceneMarkersForAsset(
  project: Project,
  assetId: string,
  candidates: SceneCandidate[],
): TimelineMarker[] {
  if (!assetId || candidates.length === 0) return [];
  const markers: TimelineMarker[] = [];
  let serial = 0;

  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.assetId !== assetId) continue;
      const speed = Math.max(0.0001, positive(clip.speed ?? 1) ?? 1);
      const sourceMin = Math.max(0, clip.inPoint);
      const sourceMax = sourceMin + clip.duration * speed;

      for (const candidate of candidates) {
        if (candidate.time < sourceMin || candidate.time > sourceMax) continue;
        const local = clip.reverse
          ? clip.duration - (candidate.time - sourceMin) / speed
          : (candidate.time - sourceMin) / speed;
        const time = clip.start + clamp(local, 0, clip.duration);
        markers.push({
          id: `auto_scene_${assetId}_${clip.id}_${serial++}`,
          time,
          name: 'Scene',
          color: '#f97316',
          note: `${AUTO_SCENE_NOTE_PREFIX}${assetId}`,
        });
      }
    }
  }

  return markers.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

export function mergeSceneMarkers(
  existing: TimelineMarker[] | undefined,
  assetId: string,
  generated: TimelineMarker[],
) {
  const note = `${AUTO_SCENE_NOTE_PREFIX}${assetId}`;
  return [
    ...(existing ?? []).filter((marker) => marker.note !== note),
    ...generated,
  ].sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
}

async function defaultReadBlob(asset: AssetMeta) {
  if (asset.objectUrl) {
    const response = await fetch(asset.objectUrl);
    if (!response.ok) throw new Error(`シーン解析用素材の読み込みに失敗しました: ${response.status}`);
    return response.blob();
  }
  return readAssetFile(asset.storageName);
}

function createAnalysisCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document === 'undefined') throw new Error('Canvasが利用できません。');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function stableTime(value: number) {
  return Number((Number.isFinite(value) ? value : 0).toFixed(9));
}

function positive(value: number) {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function throwIfAborted(signal?: AbortSignal) {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  if (reason instanceof Error) throw reason;
  throw new DOMException(typeof reason === 'string' ? reason : 'Operation aborted', 'AbortError');
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
