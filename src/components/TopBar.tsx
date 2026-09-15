import { Download, FolderOpen, Save } from 'lucide-react';
import type { CapabilityReport } from '../core/capabilities';

interface Props {
  projectName: string;
  onProjectName: (name: string) => void;
  onSave: () => void;
  onExport: () => void;
  capabilities: CapabilityReport;
  saveState: string;
}

export function TopBar({ projectName, onProjectName, onSave, onExport, capabilities, saveState }: Props) {
  const ready = Object.values(capabilities).filter(Boolean).length;
  return (
    <header className="topbar">
      <div className="brand">
        <div className="brandMark">S</div>
        <div>
          <strong>Suiram Video Edit</strong>
          <span>browser-native editor</span>
        </div>
      </div>
      <div className="projectTitleWrap">
        <FolderOpen size={15} />
        <input value={projectName} onChange={(e) => onProjectName(e.target.value)} aria-label="プロジェクト名" />
        <span className="saveState">{saveState}</span>
      </div>
      <div className="topActions">
        <span className="capPill" title="利用可能なブラウザ機能数">{ready}/6 engine</span>
        <button className="button" onClick={onSave}><Save size={16} />保存</button>
        <button className="button primary" onClick={onExport} title="プロジェクトJSONを端末へバックアップ"><Download size={16} />バックアップ</button>
      </div>
    </header>
  );
}
