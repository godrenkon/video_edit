import { useEffect, useRef, useState } from 'react';
import { measurePlaybackStep } from '../render/playbackDiagnostics';
import { readDecodeLatencySnapshot } from '../render/decodeDiagnostics';
import '../playback-diagnostics.css';

interface Stats {
  fps: number;
  dropped: number;
  maxDelayMs: number;
  decodeAverageMs: number;
  decodeP95Ms: number;
  decodeSamples: number;
}

export function PlaybackDiagnostics({ time, playing, fps }: { time: number; playing: boolean; fps: number }) {
  const lastWall = useRef<number | null>(null);
  const windowStart = useRef(0);
  const samples = useRef(0);
  const elapsedTotal = useRef(0);
  const droppedTotal = useRef(0);
  const maxDelay = useRef(0);
  const [stats, setStats] = useState<Stats>({ fps: 0, dropped: 0, maxDelayMs: 0, decodeAverageMs: 0, decodeP95Ms: 0, decodeSamples: 0 });

  useEffect(() => {
    if (!playing) {
      lastWall.current = null;
      windowStart.current = 0;
      samples.current = 0;
      elapsedTotal.current = 0;
      droppedTotal.current = 0;
      maxDelay.current = 0;
      setStats({ fps: 0, dropped: 0, maxDelayMs: 0, decodeAverageMs: 0, decodeP95Ms: 0, decodeSamples: 0 });
      return;
    }

    const now = performance.now();
    if (lastWall.current === null) {
      lastWall.current = now;
      windowStart.current = now;
      return;
    }

    const measurement = measurePlaybackStep(lastWall.current, now, fps);
    lastWall.current = now;
    samples.current += 1;
    elapsedTotal.current += measurement.elapsedMs;
    droppedTotal.current += measurement.droppedFrames;
    maxDelay.current = Math.max(maxDelay.current, measurement.delayMs);

    if (now - windowStart.current >= 500) {
      const measuredFps = elapsedTotal.current > 0 ? samples.current * 1000 / elapsedTotal.current : 0;
      const decode = readDecodeLatencySnapshot(now, 5_000);
      setStats({
        fps: measuredFps,
        dropped: droppedTotal.current,
        maxDelayMs: maxDelay.current,
        decodeAverageMs: decode.averageMs,
        decodeP95Ms: decode.p95Ms,
        decodeSamples: decode.count,
      });
      windowStart.current = now;
      samples.current = 0;
      elapsedTotal.current = 0;
      maxDelay.current = 0;
    }
  }, [fps, playing, time]);

  if (!playing && stats.dropped === 0) return null;
  const frameBudgetMs = 1000 / Math.max(1, fps);
  const decodeWarning = stats.decodeSamples > 0 && stats.decodeP95Ms > frameBudgetMs;
  return (
    <span
      className={`playbackDiagnostics ${stats.dropped > 0 || decodeWarning ? 'warn' : ''}`}
      title="Preview playback diagnostics: FPS / dropped frames / frame delay / video decode latency"
    >
      {stats.fps.toFixed(1)} fps · drop {stats.dropped} · +{stats.maxDelayMs.toFixed(0)}ms
      {stats.decodeSamples > 0 && ` · decode ${stats.decodeAverageMs.toFixed(1)}/${stats.decodeP95Ms.toFixed(1)}ms avg/p95`}
    </span>
  );
}
