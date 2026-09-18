import { useEffect, useState } from 'react';
import { readPreviewAudioMeter } from '../render/previewAudioGraph';
import '../audio-meter.css';

interface MeterState {
  peakDb: number;
  rmsDb: number;
  lufsMomentary: number;
}

export function PreviewAudioMeter({ playing }: { playing: boolean }) {
  const [meter, setMeter] = useState<MeterState>({ peakDb: -120, rmsDb: -120, lufsMomentary: -120 });

  useEffect(() => {
    if (!playing) {
      setMeter({ peakDb: -120, rmsDb: -120, lufsMomentary: -120 });
      return;
    }

    let raf = 0;
    let lastUpdate = 0;
    const tick = (now: number) => {
      if (now - lastUpdate >= 100) {
        const reading = readPreviewAudioMeter();
        setMeter({ peakDb: reading.peakDb, rmsDb: reading.rmsDb, lufsMomentary: reading.lufsMomentary ?? -120 });
        lastUpdate = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  return (
    <span className={`previewAudioMeter ${meter.peakDb > -1 ? 'hot' : ''}`} title="Preview master audio: Momentary LUFS / RMS / Peak">
      M {formatLufs(meter.lufsMomentary)} · RMS {formatDb(meter.rmsDb)} · PK {formatDb(meter.peakDb)}
    </span>
  );
}

function formatDb(value: number) {
  if (!Number.isFinite(value) || value <= -119.9) return '-∞';
  return `${value.toFixed(1)}dB`;
}


function formatLufs(value: number) {
  if (!Number.isFinite(value) || value <= -119.9) return '-∞ LUFS';
  return `${value.toFixed(1)} LUFS`;
}
