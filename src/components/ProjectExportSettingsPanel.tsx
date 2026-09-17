import { Download, Film, Music, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { resolveExportDimensions } from '../render/projectExporter';
import { exportProjectWav } from '../render/wavExporter';
import type { Project, ProjectExportContainer, ProjectExportQuality, ProjectExportSettings } from '../types/editor';
import '../export-settings.css';

interface Props {
  project: Project;
  onChange: (settings: ProjectExportSettings) => void;
}

const resolutionPresets = [
  { label: '原寸', value: 0 },
  { label: '720p', value: 720 },
  { label: '1080p', value: 1080 },
  { label: '1440p', value: 1440 },
  { label: '4K / 2160p', value: 2160 },
] as const;

export function ProjectExportSettingsPanel({ project, onChange }: Props) {
  const settings = project.exportSettings ?? {};
  const container = settings.container ?? 'auto';
  const quality = settings.quality ?? 'balanced';
  const outputHeight = settings.outputHeight ?? 0;
  const includeAudio = settings.includeAudio !== false;
  const dimensions = resolveExportDimensions(project, { outputHeight: outputHeight || undefined });
  const [wavBusy, setWavBusy] = useState(false);
  const [wavProgress, setWavProgress] = useState<number | null>(null);
  const [wavStatus, setWavStatus] = useState('');
  const wavAbort = useRef<AbortController | null>(null);

  const patch = (next: Partial<ProjectExportSettings>) => onChange({ ...settings, ...next });

  const exportWav = async () => {
    if (wavBusy) return;
    const controller = new AbortController();
    wavAbort.current = controller;
    setWavBusy(true);
    setWavProgress(0);
    setWavStatus('WAVを書き出しています…');
    try {
      const result = await exportProjectWav(project, {
        preferOpfs: true,
        signal: controller.signal,
        onProgress: (progress) => setWavProgress(progress.fraction),
      });
      if (controller.signal.aborted) return;
      const output = result.storage === 'opfs' ? result.file : result.blob;
      downloadBlob(output, result.fileName);
      setWavProgress(1);
      setWavStatus(`${result.sampleRate / 1000}kHz / ${result.channels === 2 ? 'Stereo' : 'Mono'} WAV 完了`);
    } catch (error) {
      if (controller.signal.aborted) setWavStatus('WAV書き出しを中止しました');
      else {
        console.error(error);
        setWavStatus(error instanceof Error ? error.message : 'WAV書き出しエラー');
      }
    } finally {
      if (wavAbort.current === controller) wavAbort.current = null;
      setWavBusy(false);
    }
  };

  const cancelWav = () => wavAbort.current?.abort('ユーザーがWAV書き出しを中止しました');

  return (
    <section className="exportSettingsCard">
      <div className="exportSettingsTitle"><Film size={13} /><strong>動画書き出し設定</strong></div>
      <label className="exportSettingField">
        <span>形式</span>
        <select value={container} onChange={(event) => patch({ container: event.target.value as ProjectExportContainer })}>
          <option value="auto">自動（MP4優先）</option>
          <option value="mp4">MP4 / H.264 + AAC</option>
          <option value="webm">WebM / VP9・VP8・AV1 + Opus</option>
        </select>
      </label>
      <label className="exportSettingField">
        <span>解像度</span>
        <select
          value={outputHeight}
          onChange={(event) => {
            const value = Number(event.target.value);
            patch({ outputHeight: value > 0 ? value : undefined });
          }}
        >
          {resolutionPresets.map((preset) => <option key={preset.value} value={preset.value}>{preset.label}</option>)}
        </select>
      </label>
      <label className="exportSettingField">
        <span>画質</span>
        <select value={quality} onChange={(event) => patch({ quality: event.target.value as ProjectExportQuality })}>
          <option value="compact">Compact / 軽量</option>
          <option value="balanced">Balanced / 標準</option>
          <option value="high">High / 高画質</option>
        </select>
      </label>
      <label className="exportAudioToggle">
        <span>音声を含める</span>
        <input type="checkbox" checked={includeAudio} onChange={(event) => patch({ includeAudio: event.target.checked })} />
      </label>
      <div className="exportSettingsSummary">
        <b>{dimensions.width}×{dimensions.height}</b>
        <span>{project.fps} fps</span>
        <span>{container === 'auto' ? '対応環境ではMP4、未対応時はWebMへ自動切替' : container.toUpperCase()}</span>
      </div>

      <div className="audioOnlyExport">
        <div className="audioOnlyTitle"><Music size={12} /><span>音声のみ</span><b>48kHz / 16-bit PCM</b></div>
        {wavBusy ? (
          <button type="button" className="audioExportButton cancel" onClick={cancelWav}>
            <X size={12} />中止 {wavProgress === null ? '' : `${Math.round(wavProgress * 100)}%`}
          </button>
        ) : (
          <button type="button" className="audioExportButton" onClick={exportWav}>
            <Download size={12} />WAVを書き出す
          </button>
        )}
        {wavBusy && <progress className="audioExportProgress" max={1} value={wavProgress ?? 0} />}
        {wavStatus && <div className="audioExportStatus">{wavStatus}</div>}
      </div>
    </section>
  );
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
