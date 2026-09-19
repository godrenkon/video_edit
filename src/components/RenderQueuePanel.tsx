import { Clock3, ListVideo, Plus, Trash2, X } from 'lucide-react';
import { renderQueueCounts, type RenderQueueJob } from '../render/renderQueue';
import '../render-queue.css';

interface Props {
  jobs: RenderQueueJob[];
  onAdd: () => void;
  onRemoveQueued: (jobId: string) => void;
  onClearFinished: () => void;
}

export function RenderQueuePanel({ jobs, onAdd, onRemoveQueued, onClearFinished }: Props) {
  const counts = renderQueueCounts(jobs);
  const hasFinished = jobs.some((job) => job.status === 'completed' || job.status === 'failed' || job.status === 'canceled');

  return (
    <div className="renderQueuePanel" role="dialog" aria-label="書き出しキュー">
      <div className="renderQueueHeader">
        <div>
          <strong><ListVideo size={14} />書き出しキュー</strong>
          <span>{counts.queued} 待機 / {counts.running} 実行 / {counts.completed} 完了 / {counts.failed} 失敗</span>
        </div>
        <button type="button" className="renderQueueAdd" onClick={onAdd}>
          <Plus size={13} />現在を追加
        </button>
      </div>

      <div className="renderQueueJobs">
        {jobs.length === 0 && (
          <div className="renderQueueEmpty">キューは空です。現在のプロジェクト状態をスナップショットして追加できます。</div>
        )}
        {jobs.map((job) => (
          <div className={`renderQueueJob ${job.status}`} key={job.id}>
            <div className="renderQueueJobMain">
              <strong>{job.projectName}</strong>
              <span><Clock3 size={11} />{new Date(job.createdAt).toLocaleTimeString()}</span>
            </div>
            <div className="renderQueueJobState">
              <span>{statusLabel(job)}</span>
              {job.status === 'queued' && (
                <button type="button" onClick={() => onRemoveQueued(job.id)} title="待機キューから削除" aria-label="待機キューから削除">
                  <X size={12} />
                </button>
              )}
            </div>
            {(job.status === 'rendering' || job.status === 'completed') && (
              <div className="renderQueueProgress" aria-label={`書き出し進捗 ${Math.round((job.progress ?? 0) * 100)}%`}>
                <span style={{ width: `${Math.max(0, Math.min(1, job.progress ?? 0)) * 100}%` }} />
              </div>
            )}
            {job.error && <div className="renderQueueError">{job.error}</div>}
          </div>
        ))}
      </div>

      <div className="renderQueueFooter">
        <span>各ジョブは追加時点の編集状態を固定して順番に処理します。</span>
        <button type="button" onClick={onClearFinished} disabled={!hasFinished}>
          <Trash2 size={12} />完了履歴を消去
        </button>
      </div>
    </div>
  );
}

function statusLabel(job: RenderQueueJob) {
  if (job.status === 'queued') return '待機中';
  if (job.status === 'rendering') return job.progress === null ? '準備中' : `書き出し ${Math.round(job.progress * 100)}%`;
  if (job.status === 'completed') return '完了';
  if (job.status === 'canceled') return '中止';
  return '失敗';
}
