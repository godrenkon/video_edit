import { Film } from 'lucide-react';
import { resolveExportDimensions } from '../render/projectExporter';
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

  const patch = (next: Partial<ProjectExportSettings>) => onChange({ ...settings, ...next });

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
    </section>
  );
}
