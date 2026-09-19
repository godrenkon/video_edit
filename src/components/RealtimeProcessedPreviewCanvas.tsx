import { useEffect, useRef, useState } from 'react';
import { PreviewRenderCache, previewCacheFrameIndex } from '../render/previewRenderCache';
import type { Project } from '../types/editor';
import '../processed-preview.css';

export function RealtimeProcessedPreviewCanvas({
  project,
  time,
  playing,
  enabled,
}: {
  project: Project;
  time: number;
  playing: boolean;
  enabled: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cacheRef = useRef<PreviewRenderCache | null>(null);
  const timeRef = useRef(time);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    timeRef.current = time;
  }, [time]);

  useEffect(() => {
    const previous = cacheRef.current;
    cacheRef.current = null;
    if (previous) void previous.close();

    try {
      cacheRef.current = new PreviewRenderCache(project, {
        maxWidth: 960,
        maxHeight: 540,
        maxBytes: 24 * 1024 * 1024,
        videoCacheBytes: 18 * 1024 * 1024,
      });
    } catch (error) {
      console.warn('Realtime processed preview is unavailable', error);
    }

    return () => {
      const cache = cacheRef.current;
      cacheRef.current = null;
      if (cache) void cache.close();
    };
  }, [project.id, project.updatedAt]);

  useEffect(() => {
    if (!enabled || !playing) {
      setVisible(false);
      return;
    }

    const cache = cacheRef.current;
    if (!cache) {
      setVisible(false);
      return;
    }

    const controller = new AbortController();
    let active = true;
    let lastFrameIndex = -1;
    let raf = 0;

    const drawFrame = async () => {
      if (!active || controller.signal.aborted) return;
      const targetTime = timeRef.current;
      const targetFrame = previewCacheFrameIndex(targetTime, project.fps, project.duration);

      if (targetFrame !== lastFrameIndex) {
        try {
          const frame = await cache.frame(project, targetTime, controller.signal);
          if (!active || controller.signal.aborted) return;
          const canvas = canvasRef.current;
          if (!canvas) return;
          if (canvas.width !== frame.width) canvas.width = frame.width;
          if (canvas.height !== frame.height) canvas.height = frame.height;
          const context = canvas.getContext('2d');
          if (!context) return;
          context.save();
          context.resetTransform();
          context.globalAlpha = 1;
          context.globalCompositeOperation = 'copy';
          context.filter = 'none';
          context.drawImage(frame.bitmap, 0, 0, frame.width, frame.height);
          context.restore();
          lastFrameIndex = frame.frameIndex;
          setVisible(true);
        } catch (error) {
          const aborted = error instanceof Error && error.name === 'AbortError';
          if (!active || controller.signal.aborted || aborted) return;
          console.warn('Realtime processed preview frame failed', error);
          setVisible(false);
        }
      }

      if (!active || controller.signal.aborted) return;
      raf = requestAnimationFrame(() => {
        void drawFrame();
      });
    };

    void drawFrame();

    return () => {
      active = false;
      controller.abort('Realtime processed preview stopped');
      if (raf) cancelAnimationFrame(raf);
    };
  }, [enabled, playing, project]);

  return (
    <canvas
      ref={canvasRef}
      className="processedPreviewCanvas"
      data-visible={visible ? 'true' : 'false'}
      aria-hidden="true"
    />
  );
}
