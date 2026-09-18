import { useEffect, useRef, useState } from 'react';
import { measurePlaybackStep } from '../render/playbackDiagnostics';
import '../playback-diagnostics.css';

interface Stats {
  fps: number;
  dropped: number;
  maxDelayMs: number;
}

export function PlaybackDiagnostics({ time, playing, fps }: { time: number; playing: boolean; fps: number }) {
  const lastWall = useRef<number | null>(null);
  const windowStart = useRef(0);
  const samples = useRef(0);
  const elapsedTotal = useRef(0);
  const droppedTotal = useRef(0);
  const maxDelay = useRef(0);
  const [stats, setStats] = useState<Stats>({ fps: 0, dropped: 0, maxDelayMs: 0 });

  useEffect(() => {
    if (!playing) {
      lastWall.current = null;
      windowStart.current = 0;
      samples.current = 0;
      elapsedTotal.current = 0;
      droppedTotal.current = 0;
      maxDelay.current = 0;
      setStats({ fps: 0, dropped: 0, maxDelayMs: 0 });
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
      setStats({
        fps: measuredFps,
        dropped: droppedTotal.current,
        maxDelayMs: maxDelay.current,
      });
      windowStart.current = now;
      samples.current = 0;
      elapsedTotal.current = 0;
      maxDelay.current = 0;
    }
  }, [fps, playing, time]);

  if (!playing && stats.dropped === 0) return null;
  return (
    <span className={`playbackDiagnostics ${stats.dropped > 0 ? 'warn' : ''}`} title="Preview playback diagnostics">
      {stats.fps.toFixed(1)} fps · drop {stats.dropped} · +{stats.maxDelayMs.toFixed(0)}ms
    </span>
  );
}
