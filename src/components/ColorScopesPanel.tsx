import { useEffect, useRef, useState } from 'react';
import { analyzeColorScopes, histogramPeak, type ColorScopeData, type ColorScopeMode } from '../render/colorScopes';
import { PreviewRenderCache } from '../render/previewRenderCache';
import type { Project } from '../types/editor';
import '../color-scopes.css';

interface Props {
  project: Project;
  time: number;
  playing: boolean;
}

const WIDTH = 320;
const HEIGHT = 180;

export function ColorScopesPanel({ project, time, playing }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef<PreviewRenderCache | null>(null);
  const [mode, setMode] = useState<ColorScopeMode>('histogram');
  const [status, setStatus] = useState('準備中');
  const [sampleCount, setSampleCount] = useState(0);

  useEffect(() => {
    const previous = cacheRef.current;
    cacheRef.current = null;
    if (previous) void previous.close();

    try {
      cacheRef.current = new PreviewRenderCache(project, {
        maxWidth: WIDTH,
        maxHeight: HEIGHT,
        maxBytes: 8 * 1024 * 1024,
        videoCacheBytes: 8 * 1024 * 1024,
      });
    } catch (error) {
      console.warn('Color scopes preview cache is unavailable', error);
      setStatus('利用不可');
    }

    return () => {
      const cache = cacheRef.current;
      cacheRef.current = null;
      if (cache) void cache.close();
    };
  }, [project.id, project.updatedAt]);

  useEffect(() => {
    const cache = cacheRef.current;
    const output = canvasRef.current;
    if (!cache || !output) return;

    const controller = new AbortController();
    const delay = playing ? 120 : 0;
    const timer = window.setTimeout(async () => {
      try {
        setStatus('解析中');
        const frame = await cache.frame(project, time, controller.signal);
        if (controller.signal.aborted) return;

        const scratch = document.createElement('canvas');
        scratch.width = frame.width;
        scratch.height = frame.height;
        const scratchContext = scratch.getContext('2d', { willReadFrequently: true });
        if (!scratchContext) throw new Error('Color scopes canvas unavailable');
        scratchContext.drawImage(frame.bitmap, 0, 0, frame.width, frame.height);
        const image = scratchContext.getImageData(0, 0, frame.width, frame.height);
        const data = analyzeColorScopes(image, 18000);
        if (controller.signal.aborted) return;

        drawScope(output, data, mode);
        setSampleCount(data.sampleCount);
        setStatus('ready');
      } catch (error) {
        const aborted = error instanceof Error && error.name === 'AbortError';
        if (controller.signal.aborted || aborted) return;
        console.warn('Color scopes failed', error);
        setStatus('エラー');
      }
    }, delay);

    return () => {
      window.clearTimeout(timer);
      controller.abort('Color scopes refresh');
    };
  }, [mode, playing, project, time]);

  return (
    <section className="panel colorScopesPanel">
      <div className="colorScopesHeader">
        <div>
          <strong>Color Scopes</strong>
          <span>{status === 'ready' ? `${sampleCount.toLocaleString()} samples` : status}</span>
        </div>
        <div className="colorScopeTabs">
          {([
            ['histogram', 'Histogram'],
            ['waveform', 'Waveform'],
            ['parade', 'RGB Parade'],
            ['vectorscope', 'Vectorscope'],
          ] as Array<[ColorScopeMode, string]>).map(([value, label]) => (
            <button key={value} type="button" className={mode === value ? 'active' : ''} onClick={() => setMode(value)}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <canvas ref={canvasRef} className="colorScopeCanvas" width={WIDTH} height={HEIGHT} aria-label="カラースコープ" />
    </section>
  );
}

function drawScope(canvas: HTMLCanvasElement, data: ColorScopeData, mode: ColorScopeMode) {
  const context = canvas.getContext('2d');
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = '#080d10';
  context.fillRect(0, 0, width, height);
  drawGrid(context, width, height);

  if (mode === 'histogram') {
    drawHistogram(context, data, width, height);
  } else if (mode === 'waveform') {
    drawWaveform(context, data.waveform, width, height, '#d7e3ec');
  } else if (mode === 'parade') {
    const section = width / 3;
    drawWaveform(context, data.paradeR, section, height, '#ff6b6b', 0);
    drawWaveform(context, data.paradeG, section, height, '#70e58d', section);
    drawWaveform(context, data.paradeB, section, height, '#65a8ff', section * 2);
  } else {
    drawVectorscope(context, data.vectorscope, width, height);
  }
}

function drawGrid(context: CanvasRenderingContext2D, width: number, height: number) {
  context.save();
  context.strokeStyle = 'rgba(255,255,255,.08)';
  context.lineWidth = 1;
  for (let i = 1; i < 4; i += 1) {
    const y = height * i / 4;
    context.beginPath();
    context.moveTo(0, y);
    context.lineTo(width, y);
    context.stroke();
  }
  for (let i = 1; i < 4; i += 1) {
    const x = width * i / 4;
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x, height);
    context.stroke();
  }
  context.restore();
}

function drawHistogram(context: CanvasRenderingContext2D, data: ColorScopeData, width: number, height: number) {
  const peak = histogramPeak(data);
  const channels = [
    [data.histogramR, '#ff6b6b'],
    [data.histogramG, '#70e58d'],
    [data.histogramB, '#65a8ff'],
  ] as const;

  context.save();
  context.globalCompositeOperation = 'screen';
  for (const [histogram, color] of channels) {
    context.strokeStyle = color;
    context.lineWidth = 1;
    context.beginPath();
    for (let index = 0; index < histogram.length; index += 1) {
      const x = index / 255 * (width - 1);
      const normalized = Math.log1p(histogram[index]) / Math.log1p(peak);
      const y = height - normalized * (height - 4) - 2;
      if (index === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
  context.restore();
}

function drawWaveform(
  context: CanvasRenderingContext2D,
  points: Float32Array,
  width: number,
  height: number,
  color: string,
  offsetX = 0,
) {
  context.save();
  context.fillStyle = color;
  context.globalAlpha = 0.18;
  const radius = 0.8;
  for (let index = 0; index < points.length; index += 2) {
    const x = offsetX + points[index] * Math.max(1, width - 1);
    const y = (1 - points[index + 1]) * Math.max(1, height - 1);
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  context.restore();
}

function drawVectorscope(context: CanvasRenderingContext2D, points: Float32Array, width: number, height: number) {
  const size = Math.min(width, height) * 0.86;
  const left = (width - size) / 2;
  const top = (height - size) / 2;

  context.save();
  context.strokeStyle = 'rgba(255,255,255,.16)';
  context.beginPath();
  context.arc(width / 2, height / 2, size / 2, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.moveTo(width / 2, top);
  context.lineTo(width / 2, top + size);
  context.moveTo(left, height / 2);
  context.lineTo(left + size, height / 2);
  context.stroke();

  context.fillStyle = '#8ee8ff';
  context.globalAlpha = 0.16;
  for (let index = 0; index < points.length; index += 2) {
    const x = left + points[index] * size;
    const y = top + (1 - points[index + 1]) * size;
    context.fillRect(x, y, 1.5, 1.5);
  }
  context.restore();
}
