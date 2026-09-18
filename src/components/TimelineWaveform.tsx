import { useEffect, useRef, useState } from 'react';
import type { AssetMeta, Clip } from '../types/editor';
import { clipSourceTime } from '../render/timelineEvaluation';
import { getAssetWaveform, waveformFingerprint, type WaveformData } from '../render/waveform';
import '../waveform.css';

const pending = new Map<string, Promise<WaveformData | null>>();

export function TimelineWaveform({ asset, clip }: { asset?: AssetMeta; clip: Clip }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [waveform, setWaveform] = useState<WaveformData | null>(null);

  useEffect(() => {
    if (!asset || asset.kind === 'image') {
      setWaveform(null);
      return;
    }
    let active = true;
    const key = `${asset.id}:${waveformFingerprint(asset)}`;
    let request = pending.get(key);
    if (!request) {
      request = getAssetWaveform(asset);
      pending.set(key, request);
      void request.finally(() => {
        if (pending.get(key) === request) pending.delete(key);
      });
    }
    request
      .then((result) => {
        if (active) setWaveform(result);
      })
      .catch((error) => {
        console.warn('Waveform analysis failed', asset.name, error);
        if (active) setWaveform(null);
      });
    return () => {
      active = false;
    };
  }, [asset?.id, asset?.hash, asset?.storageName, asset?.size, asset?.duration]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !waveform || waveform.peaks.length === 0) return;

    const draw = () => drawWaveform(canvas, waveform, clip);
    draw();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(draw) : null;
    observer?.observe(canvas);
    return () => observer?.disconnect();
  }, [waveform, clip.start, clip.duration, clip.inPoint, clip.speed, clip.reverse]);

  if (!asset || asset.kind === 'image') return null;
  return <canvas ref={canvasRef} className="timelineWaveform" aria-hidden="true" />;
}

function drawWaveform(canvas: HTMLCanvasElement, waveform: WaveformData, clip: Clip) {
  const rect = canvas.getBoundingClientRect();
  const cssWidth = Math.max(1, rect.width);
  const cssHeight = Math.max(1, rect.height);
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const pixelWidth = Math.max(1, Math.round(cssWidth * dpr));
  const pixelHeight = Math.max(1, Math.round(cssHeight * dpr));
  if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
  if (canvas.height !== pixelHeight) canvas.height = pixelHeight;

  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, pixelWidth, pixelHeight);
  context.save();
  context.scale(dpr, dpr);
  context.strokeStyle = getComputedStyle(canvas).color;
  context.lineWidth = 1;
  context.beginPath();

  const columns = Math.max(1, Math.floor(cssWidth));
  const center = cssHeight / 2;
  const amplitude = Math.max(1, cssHeight * 0.44);
  for (let x = 0; x < columns; x += 1) {
    const localA = x / columns * clip.duration;
    const localB = (x + 1) / columns * clip.duration;
    const sourceA = clipSourceTime(clip, clip.start + localA);
    const sourceB = clipSourceTime(clip, clip.start + localB);
    const low = Math.max(0, Math.min(sourceA, sourceB));
    const high = Math.min(waveform.duration, Math.max(sourceA, sourceB));
    const peak = peakBetween(waveform, low, high);
    const half = Math.max(0.5, peak * amplitude);
    const drawX = x + 0.5;
    context.moveTo(drawX, center - half);
    context.lineTo(drawX, center + half);
  }
  context.stroke();
  context.restore();
}

function peakBetween(waveform: WaveformData, start: number, end: number) {
  if (waveform.duration <= 0 || waveform.peaks.length === 0 || end < 0 || start > waveform.duration) return 0;
  const from = Math.max(0, Math.min(waveform.peaks.length - 1, Math.floor(start / waveform.duration * waveform.peaks.length)));
  const to = Math.max(from, Math.min(waveform.peaks.length - 1, Math.ceil(end / waveform.duration * waveform.peaks.length)));
  let peak = 0;
  for (let index = from; index <= to; index += 1) peak = Math.max(peak, waveform.peaks[index] ?? 0);
  return peak;
}
