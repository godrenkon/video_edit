import { Save, Trash2 } from 'lucide-react';
import { useState } from 'react';
import {
  createProjectSettingsTemplate,
  loadProjectSettingsTemplates,
  normalizeProjectTemplateName,
  projectSettingsPatch,
  saveProjectSettingsTemplates,
} from '../core/projectTemplates';
import { frameRateDisplayLabel } from '../core/timebase';
import type { Project } from '../types/editor';
import '../project-templates.css';

export function ProjectTemplatesPanel({
  project,
  onApply,
}: {
  project: Project;
  onApply: (patch: Partial<Project>) => void;
}) {
  const [templates, setTemplates] = useState(() => loadProjectSettingsTemplates());
  const [selectedId, setSelectedId] = useState('');
  const [name, setName] = useState('');
  const selected = templates.find((template) => template.id === selectedId) ?? templates[0] ?? null;

  const commit = (next: typeof templates) => {
    setTemplates(next);
    saveProjectSettingsTemplates(next);
    if (selectedId && !next.some((template) => template.id === selectedId)) {
      setSelectedId(next[0]?.id ?? '');
    }
  };

  const saveCurrent = () => {
    const normalized = normalizeProjectTemplateName(name) || `Preset ${templates.length + 1}`;
    const template = createProjectSettingsTemplate(normalized, project);
    const next = [template, ...templates].slice(0, 32);
    commit(next);
    setSelectedId(template.id);
    setName('');
  };

  const apply = () => {
    if (!selected) return;
    onApply(projectSettingsPatch(selected));
  };

  const remove = () => {
    if (!selected) return;
    commit(templates.filter((template) => template.id !== selected.id));
  };

  return (
    <section className="projectTemplatePanel">
      <div className="projectTemplateTitle"><strong>設定テンプレート</strong><span>素材・クリップは変更しません</span></div>
      <div className="projectTemplateSave">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          placeholder="例: YouTube 1080p60"
          aria-label="プロジェクト設定テンプレート名"
        />
        <button type="button" onClick={saveCurrent} title="現在の設定を保存"><Save size={12} />保存</button>
      </div>
      <div className="projectTemplateApply">
        <select
          value={selected?.id ?? ''}
          onChange={(event) => setSelectedId(event.target.value)}
          disabled={templates.length === 0}
          aria-label="プロジェクト設定テンプレート"
        >
          {templates.length === 0 && <option value="">テンプレートなし</option>}
          {templates.map((template) => (
            <option key={template.id} value={template.id}>
              {template.name} · {template.width}×{template.height} / {frameRateDisplayLabel(template.fps)}fps · {template.timecodeMode === 'drop-frame' ? 'DF' : 'NDF'}
            </option>
          ))}
        </select>
        <button type="button" onClick={apply} disabled={!selected}>適用</button>
        <button type="button" className="danger" onClick={remove} disabled={!selected} title="テンプレートを削除"><Trash2 size={12} /></button>
      </div>
    </section>
  );
}