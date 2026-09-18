import { useEffect, useState } from 'react';
import { readPreviewAudioMeter } from '../render/previewAudioGraph';
import '../audio-meter.css';

interface MeterState {
  peakDb: number;
  rmsDb: number;
}

export function PreviewAudioMeter({ playing }: { playing: boolean }) {
  const [meter, setMeter] = useState<MeterState>({ peakDb: -120, rmsDb: -120 });

  useEffect(() => {
    if (!playing) {
      setMeter({ peakDb: -120, rmsDb: -120 });
      return;
    }

    let raf = 0;
    let lastUpdate = 0;
    const tick = (now: number) => {
      if (now - lastUpdate >= 100) {
        const reading = readPreviewAudioMeter();
        setMeter({ peakDb: reading.peakDb, rmsDb: reading.rmsDb });
        lastUpdate = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  return (
    <span className={`previewAudioMeter ${meter.peakDb > -1 ? 'hot' : ''}`} title="Preview audio peak / RMS">
      RMS {formatDb(meter.rmsDb)} · PK {formatDb(meter.peakDb)}
    </span>
  );
}

function formatDb(value: number) {
  if (!Number.isFinite(value) || value <= -119.9) return '-∞';
  return `${value.toFixed(1)}dB`;
}
