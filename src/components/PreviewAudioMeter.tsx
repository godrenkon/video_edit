import { useEffect, useRef, useState } from 'react';
import { readPreviewAudioMeter } from '../render/previewAudioGraph';
import { integratedLoudness, shortTermLoudness, type LoudnessHistoryPoint } from '../render/loudnessHistory';
import '../audio-meter.css';

interface MeterState {
  peakDb: number;
  rmsDb: number;
  lufsMomentary: number;
  lufsShortTerm: number;
  lufsIntegrated: number;
}

export function PreviewAudioMeter({ playing }: { playing: boolean }) {
  const [meter, setMeter] = useState<MeterState>({
    peakDb: -120,
    rmsDb: -120,
    lufsMomentary: -120,
    lufsShortTerm: -120,
    lufsIntegrated: -120,
  });
  const shortWindowRef = useRef<LoudnessHistoryPoint[]>([]);
  const integratedBlocksRef = useRef<number[]>([]);
  const lastIntegratedUpdateRef = useRef(0);
  const lastIntegratedBlockRef = useRef(0);
  const integratedValueRef = useRef(-120);

  useEffect(() => {
    if (!playing) {
      shortWindowRef.current = [];
      integratedBlocksRef.current = [];
      lastIntegratedUpdateRef.current = 0;
      lastIntegratedBlockRef.current = 0;
      integratedValueRef.current = -120;
      setMeter({
        peakDb: -120,
        rmsDb: -120,
        lufsMomentary: -120,
        lufsShortTerm: -120,
        lufsIntegrated: -120,
      });
      return;
    }

    let raf = 0;
    let lastUpdate = 0;
    const tick = (now: number) => {
      if (now - lastUpdate >= 100) {
        const reading = readPreviewAudioMeter();
        const momentary = reading.lufsMomentary ?? -120;
        shortWindowRef.current.push({ timeMs: now, lufs: momentary });
        shortWindowRef.current = shortWindowRef.current.filter((point) => point.timeMs >= now - 3000);
        if (now - lastIntegratedBlockRef.current >= 400) {
          integratedBlocksRef.current.push(momentary);
          lastIntegratedBlockRef.current = now;
        }

        const shortTerm = shortTermLoudness(shortWindowRef.current, now);
        let integrated = integratedValueRef.current;
        if (now - lastIntegratedUpdateRef.current >= 1000) {
          integrated = integratedLoudness(integratedBlocksRef.current);
          integratedValueRef.current = integrated;
          lastIntegratedUpdateRef.current = now;
        }

        setMeter({
          peakDb: reading.peakDb,
          rmsDb: reading.rmsDb,
          lufsMomentary: momentary,
          lufsShortTerm: shortTerm,
          lufsIntegrated: integrated,
        });
        lastUpdate = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  return (
    <span className={`previewAudioMeter ${meter.peakDb > -1 ? 'hot' : ''}`} title="Preview master audio: LUFS-M / LUFS-S / gated Integrated / RMS / Peak">
      M {formatLufs(meter.lufsMomentary)} · S {formatLufs(meter.lufsShortTerm)} · I {formatLufs(meter.lufsIntegrated)} · RMS {formatDb(meter.rmsDb)} · PK {formatDb(meter.peakDb)}
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
