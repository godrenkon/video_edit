import { useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { evaluateEffectParameter } from '../core/keyframes';
import type { EffectParameter, Keyframe } from '../types/editor';
import '../keyframe-graph.css';

interface Props {
  parameter: EffectParameter;
  min: number;
  max: number;
  duration: number;
  fps: number;
  currentTime: number;
  onChange: (parameter: EffectParameter) => void;
}

const WIDTH = 260;
const HEIGHT = 92;
const PADDING_X = 8;
const PADDING_Y = 8;

export function KeyframeGraph({
  parameter,
  min,
  max,
  duration,
  fps,
  currentTime,
  onChange,
}: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const safeDuration = Math.max(1 / Math.max(1, fps), Number.isFinite(duration) ? duration : 0);
  const safeMin = Number.isFinite(min) ? min : 0;
  const safeMax = Number.isFinite(max) && max > safeMin ? max : safeMin + 1;
  const keyframes = useMemo(
    () => (parameter.keyframes ?? []).filter((keyframe) => typeof keyframe.value === 'number'),
    [parameter.keyframes],
  );

  const curve = useMemo(() => {
    const points: string[] = [];
    const samples = 72;
    for (let index = 0; index <= samples; index += 1) {
      const time = safeDuration * index / samples;
      const evaluated = evaluateEffectParameter(parameter, time);
      const value = typeof evaluated === 'number' && Number.isFinite(evaluated) ? evaluated : safeMin;
      points.push(`${timeToX(time, safeDuration)},${valueToY(value, safeMin, safeMax)}`);
    }
    return points.join(' ');
  }, [parameter, safeDuration, safeMax, safeMin]);

  const pointerValues = (event: ReactPointerEvent<SVGSVGElement> | ReactMouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / Math.max(1, rect.width) * WIDTH;
    const y = (event.clientY - rect.top) / Math.max(1, rect.height) * HEIGHT;
    return {
      time: quantizeGraphTime(xToTime(x, safeDuration), fps, safeDuration),
      value: yToValue(y, safeMin, safeMax),
    };
  };

  const updateDragging = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!draggingId) return;
    const next = pointerValues(event);
    const updated = (parameter.keyframes ?? []).map((keyframe) => keyframe.id === draggingId
      ? { ...keyframe, time: next.time, value: next.value }
      : keyframe);
    updated.sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
    onChange({ ...parameter, keyframes: updated });
  };

  const stopDragging = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!draggingId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    setDraggingId(null);
  };

  const addKeyframe = (event: ReactMouseEvent<SVGSVGElement>) => {
    if (draggingId) return;
    const next = pointerValues(event);
    const keyframe: Keyframe = {
      id: `kf_${crypto.randomUUID()}`,
      time: next.time,
      value: next.value,
      interpolation: 'linear',
    };
    const updated = [...(parameter.keyframes ?? []), keyframe]
      .sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
    onChange({ ...parameter, keyframes: updated });
  };

  return (
    <div className="keyframeGraphWrap">
      <svg
        ref={svgRef}
        className="keyframeGraph"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="キーフレームグラフ"
        onPointerMove={updateDragging}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        onDoubleClick={addKeyframe}
      >
        <line className="keyframeGraphGrid" x1={PADDING_X} y1={HEIGHT / 2} x2={WIDTH - PADDING_X} y2={HEIGHT / 2} />
        <line
          className="keyframeGraphPlayhead"
          x1={timeToX(currentTime, safeDuration)}
          y1={PADDING_Y}
          x2={timeToX(currentTime, safeDuration)}
          y2={HEIGHT - PADDING_Y}
        />
        <polyline className="keyframeGraphCurve" points={curve} />
        {keyframes.map((keyframe) => {
          const value = typeof keyframe.value === 'number' ? keyframe.value : safeMin;
          return (
            <circle
              key={keyframe.id}
              className={`keyframeGraphPoint ${draggingId === keyframe.id ? 'dragging' : ''}`}
              cx={timeToX(keyframe.time, safeDuration)}
              cy={valueToY(value, safeMin, safeMax)}
              r={4.5}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                svgRef.current?.setPointerCapture(event.pointerId);
                setDraggingId(keyframe.id);
              }}
            />
          );
        })}
      </svg>
      <div className="keyframeGraphLegend">
        <span>{formatValue(safeMax)}</span>
        <span>ダブルクリックで追加 / 点をドラッグ</span>
        <span>{formatValue(safeMin)}</span>
      </div>
    </div>
  );
}

export function timeToX(time: number, duration: number) {
  const usable = WIDTH - PADDING_X * 2;
  const normalized = clamp((Number.isFinite(time) ? time : 0) / Math.max(Number.EPSILON, duration), 0, 1);
  return PADDING_X + normalized * usable;
}

export function xToTime(x: number, duration: number) {
  const usable = WIDTH - PADDING_X * 2;
  const normalized = clamp((x - PADDING_X) / usable, 0, 1);
  return normalized * Math.max(0, duration);
}

export function valueToY(value: number, min: number, max: number) {
  const usable = HEIGHT - PADDING_Y * 2;
  const normalized = clamp((value - min) / Math.max(Number.EPSILON, max - min), 0, 1);
  return HEIGHT - PADDING_Y - normalized * usable;
}

export function yToValue(y: number, min: number, max: number) {
  const usable = HEIGHT - PADDING_Y * 2;
  const normalized = 1 - clamp((y - PADDING_Y) / usable, 0, 1);
  return min + normalized * (max - min);
}

export function quantizeGraphTime(time: number, fps: number, duration: number) {
  const safeFps = Math.max(1, Number.isFinite(fps) ? fps : 1);
  const frame = Math.round(Math.max(0, time) * safeFps) / safeFps;
  return clamp(frame, 0, Math.max(0, duration));
}

function formatValue(value: number) {
  return Math.abs(value) >= 100 ? Math.round(value).toString() : Number(value.toFixed(2)).toString();
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
