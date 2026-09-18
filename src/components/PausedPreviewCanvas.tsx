import { useEffect, useRef, useState } from 'react';
import { PreviewRenderCache } from '../render/previewRenderCache';
import type { Project } from '../types/editor';
import '../preview-cache.css';

export function PausedPreviewCanvas({
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
  const requestRef = useRef<AbortController | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestRef.current?.abort('Preview revision changed');
    requestRef.current = null;
    const previous = cacheRef.current;
    cacheRef.current = null;
    if (previous) void previous.close();

    try {
      cacheRef.current = new PreviewRenderCache(project);
    } catch (error) {
      console.warn('Paused preview render cache is unavailable', error);
    }

    return () => {
      requestRef.current?.abort('Preview cache disposed');
      requestRef.current = null;
      const cache = cacheRef.current;
      cacheRef.current = null;
      if (cache) void cache.close();
    };
  }, [project.id, project.updatedAt]);

  useEffect(() => {
    if (playing || !enabled) {
      requestRef.current?.abort('Realtime preview active');
      requestRef.current = null;
      setVisible(false);
      return;
    }

    const cache = cacheRef.current;
    const canvas = canvasRef.current;
    if (!cache || !canvas) {
      setVisible(false);
      return;
    }

    requestRef.current?.abort('New preview frame requested');
    const controller = new AbortController();
    requestRef.current = controller;
    let active = true;

    cache.frame(project, time, controller.signal)
      .then((frame) => {
        if (!active || controller.signal.aborted) return;
        const current = canvasRef.current;
        if (!current) return;
        if (current.width !== frame.width) current.width = frame.width;
        if (current.height !== frame.height) current.height = frame.height;
        const context = current.getContext('2d');
        if (!context) return;
        context.save();
        context.resetTransform();
        context.globalAlpha = 1;
        context.globalCompositeOperation = 'copy';
        context.filter = 'none';
        context.drawImage(frame.bitmap, 0, 0, frame.width, frame.height);
        context.restore();
        setVisible(true);
      })
      .catch((error) => {
        const aborted = error instanceof Error && error.name === 'AbortError';
        if (!active || controller.signal.aborted || aborted) return;
        console.warn('Paused preview cached render failed; using DOM preview', error);
        setVisible(false);
      });

    return () => {
      active = false;
      controller.abort('Preview frame superseded');
    };
  }, [enabled, playing, project, time]);

  return (
    <canvas
      ref={canvasRef}
      className="pausedPreviewCanvas"
      data-visible={visible ? 'true' : 'false'}
      aria-hidden="true"
    />
  );
}
