import { useEffect, useMemo, useState } from 'react';
import type { AssetMeta, Clip } from '../types/editor';
import { clipSourceTime } from '../render/timelineEvaluation';
import { getTimelineThumbnail } from '../render/thumbnailCache';
import '../timeline-thumbnails.css';

const TILE_WIDTH = 112;
const MAX_TILES_PER_CLIP = 8;

export function TimelineThumbnailStrip({
  asset,
  clip,
  pixelsPerSecond,
}: {
  asset?: AssetMeta;
  clip: Clip;
  pixelsPerSecond: number;
}) {
  const times = useMemo(
    () => thumbnailTimes(clip, pixelsPerSecond, asset?.duration ?? 0),
    [clip.start, clip.duration, clip.inPoint, clip.speed, clip.reverse, pixelsPerSecond, asset?.duration],
  );

  if (!asset || asset.kind !== 'video' || times.length === 0) return null;

  return (
    <div className="timelineThumbnailStrip" aria-hidden="true">
      {times.map((time, index) => (
        <ThumbnailTile key={`${time.toFixed(3)}:${index}`} asset={asset} sourceTime={time} />
      ))}
    </div>
  );
}

export function thumbnailTimes(clip: Clip, pixelsPerSecond: number, assetDuration: number) {
  if (!Number.isFinite(assetDuration) || assetDuration <= 0 || clip.duration <= 0) return [];
  const pixelWidth = Math.max(1, clip.duration * Math.max(1, pixelsPerSecond));
  const count = Math.max(1, Math.min(MAX_TILES_PER_CLIP, Math.ceil(pixelWidth / TILE_WIDTH)));
  return Array.from({ length: count }, (_, index) => {
    const local = ((index + 0.5) / count) * clip.duration;
    return Math.max(0, Math.min(assetDuration, clipSourceTime(clip, clip.start + local)));
  });
}

function ThumbnailTile({ asset, sourceTime }: { asset: AssetMeta; sourceTime: number }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setUrl(null);
    getTimelineThumbnail(asset, sourceTime)
      .then((value) => {
        if (active) setUrl(value);
      })
      .catch((error) => {
        console.warn('Timeline thumbnail generation failed', asset.name, error);
        if (active) setUrl(null);
      });
    return () => {
      active = false;
    };
  }, [asset.id, asset.hash, asset.storageName, asset.proxyStorageName, asset.size, asset.duration, sourceTime]);

  return <span className="timelineThumbnailTile">{url ? <img src={url} alt="" draggable={false} /> : <i />}</span>;
}
