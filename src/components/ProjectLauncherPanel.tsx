import { FolderOpen, Plus, Trash2 } from 'lucide-react';
import type { StoredProjectInfo } from '../core/storage';
import '../project-launcher.css';

interface Props {
  projects: StoredProjectInfo[];
  currentProjectId: string;
  busy: boolean;
  onCreate: () => void;
  onOpen: (projectId: string) => void;
  onDelete: (projectId: string) => void;
}

export function ProjectLauncherPanel({
  projects,
  currentProjectId,
  busy,
  onCreate,
  onOpen,
  onDelete,
}: Props) {
  return (
    <div className="projectLauncher" role="dialog" aria-label="プロジェクト一覧">
      <div className="projectLauncherHeader">
        <div>
          <strong>プロジェクト</strong>
          <span>{projects.length} 件をローカル保存</span>
        </div>
        <button type="button" onClick={onCreate} disabled={busy}>
          <Plus size={13} />新規
        </button>
      </div>

      <div className="projectLauncherList">
        {projects.length === 0 && <div className="projectLauncherEmpty">保存済みプロジェクトはありません。</div>}
        {projects.map((item) => {
          const active = item.id === currentProjectId;
          return (
            <div className={`projectLauncherRow ${active ? 'active' : ''}`} key={item.id}>
              <button
                type="button"
                className="projectLauncherOpen"
                onClick={() => onOpen(item.id)}
                disabled={busy || active}
                title={active ? '現在開いているプロジェクト' : 'このプロジェクトを開く'}
              >
                <FolderOpen size={14} />
                <span>
                  <strong>{item.name}</strong>
                  <small>
                    {item.width}×{item.height} / {item.fps}fps ・ {formatDuration(item.duration)}
                    {' ・ '}
                    {formatUpdatedAt(item.updatedAt)}
                  </small>
                </span>
                {active && <b>OPEN</b>}
              </button>
              <button
                type="button"
                className="projectLauncherDelete"
                onClick={() => onDelete(item.id)}
                disabled={busy || active}
                aria-label={`${item.name}を削除`}
                title={active ? '開いているプロジェクトは削除できません' : 'プロジェクト登録を削除'}
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
      </div>

      <div className="projectLauncherNote">
        素材は共有OPFS保管庫に残し、プロジェクト削除時に誤って元動画を消さない設計です。
      </div>
    </div>
  );
}

function formatDuration(seconds: number) {
  const value = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(value / 60);
  const rest = Math.floor(value - minutes * 60);
  return `${minutes}:${String(rest).padStart(2, '0')}`;
}

function formatUpdatedAt(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '更新日時不明' : date.toLocaleString();
}
