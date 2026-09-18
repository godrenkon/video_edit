import { Volume2, VolumeX } from 'lucide-react';
import { dbToLinear, linearToDb } from '../render/trackMix';
import { setTrackGain, setTrackMuted, setTrackPan, setTrackSolo } from '../core/trackOps';
import type { Project, Track } from '../types/editor';
import '../track-mixer.css';

export function TrackMixerPanel({
  project,
  onProject,
}: {
  project: Project;
  onProject: (patch: Partial<Project>) => void;
}) {
  const tracks = project.tracks.filter((track) => track.kind === 'audio' || track.kind === 'video');

  const apply = (next: Project) => {
    if (next === project) return;
    onProject({ tracks: next.tracks });
  };

  if (tracks.length === 0) return null;

  return (
    <section className="trackMixerPanel">
      <div className="trackMixerHeader">
        <strong>Track Mixer</strong>
        <span>{tracks.length} channels</span>
      </div>
      <div className="trackMixerChannels">
        {tracks.map((track) => (
          <TrackStrip
            key={track.id}
            track={track}
            onMute={(muted) => apply(setTrackMuted(project, track.id, muted))}
            onSolo={(solo) => apply(setTrackSolo(project, track.id, solo))}
            onGain={(gain) => apply(setTrackGain(project, track.id, gain))}
            onPan={(pan) => apply(setTrackPan(project, track.id, pan))}
            onReset={() => apply(setTrackPan(setTrackGain(project, track.id, 1), track.id, 0))}
          />
        ))}
      </div>
      <div className="trackMixerNote">gain/panはPreviewとoffline exportの両方へ反映</div>
    </section>
  );
}

function TrackStrip({
  track,
  onMute,
  onSolo,
  onGain,
  onPan,
  onReset,
}: {
  track: Track;
  onMute: (muted: boolean) => void;
  onSolo: (solo: boolean) => void;
  onGain: (gain: number) => void;
  onPan: (pan: number) => void;
  onReset: () => void;
}) {
  const gainDb = linearToDb(track.gain ?? 1);
  const pan = track.pan ?? 0;

  return (
    <div className="trackMixerStrip">
      <div className="trackMixerName" title={track.name}>
        <span className={`trackMixerBadge ${track.kind}`}>{track.kind === 'audio' ? 'A' : 'V'}</span>
        <strong>{track.name}</strong>
      </div>
      <div className="trackMixerButtons">
        <button
          type="button"
          className={track.muted ? 'active mute' : ''}
          onClick={() => onMute(!track.muted)}
          title={track.muted ? 'Mute解除' : 'Mute'}
        >
          {track.muted ? <VolumeX size={11} /> : <Volume2 size={11} />} M
        </button>
        <button
          type="button"
          className={track.solo ? 'active solo' : ''}
          onClick={() => onSolo(!track.solo)}
          title="Solo"
        >S</button>
      </div>

      <label className="trackMixerControl">
        <span>Gain <b>{formatDb(gainDb)}</b></span>
        <input
          type="range"
          min={-60}
          max={12}
          step={0.5}
          value={gainDb}
          onChange={(event) => onGain(dbToLinear(Number(event.target.value)))}
        />
      </label>

      <label className="trackMixerControl">
        <span>Pan <b>{formatPan(pan)}</b></span>
        <input
          type="range"
          min={-1}
          max={1}
          step={0.01}
          value={pan}
          onChange={(event) => onPan(Number(event.target.value))}
        />
      </label>

      <button
        type="button"
        className="trackMixerReset"
        onClick={onReset}
      >0 dB / C</button>
    </div>
  );
}

function formatDb(value: number) {
  if (value <= -59.9) return '-∞';
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded.toFixed(1)} dB`;
}

function formatPan(value: number) {
  if (Math.abs(value) < 0.005) return 'C';
  return `${value < 0 ? 'L' : 'R'}${Math.round(Math.abs(value) * 100)}`;
}
