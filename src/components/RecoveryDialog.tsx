import { AlertTriangle, RotateCcw, X } from 'lucide-react';
import type { RecoverySnapshotInfo } from '../core/storage';

interface Props {
  snapshots: RecoverySnapshotInfo[];
  suspectedCrash: boolean;
  busy?: boolean;
  onRestore: (id: string) => void;
  onDismiss: () => void;
}

export function RecoveryDialog({ snapshots, suspectedCrash, busy = false, onRestore, onDismiss }: Props) {
  if (snapshots.length === 0) return null;

  return (
    <div className="recoveryBackdrop" role="presentation">
      <section className="recoveryDialog" role="dialog" aria-modal="true" aria-labelledby="recovery-title">
        <header className="recoveryHeader">
          <div>
            <div className="recoveryTitleRow">
              <AlertTriangle size={18} />
              <h2 id="recovery-title">編集状態を復旧</h2>
            </div>
            <p>
              {suspectedCrash
                ? '前回の編集セッションが正常終了しなかった可能性があります。自動保存スナップショットから復旧できます。'
                : '自動保存スナップショットから以前の編集状態へ戻せます。'}
            </p>
          </div>
          <button className="iconBtn" onClick={onDismiss} disabled={busy} title="閉じる" aria-label="閉じる"><X size={17} /></button>
        </header>

        <div className="recoveryList">
          {snapshots.map((snapshot, index) => (
            <article className="recoveryItem" key={snapshot.id}>
              <div className="recoveryMeta">
                <strong>{snapshot.projectName || '無題のプロジェクト'}</strong>
                <span>{index === 0 ? '最新の復旧候補' : `${index + 1} 世代前`}</span>
                <small>{formatDate(snapshot.lastModified)} ・ {formatBytes(snapshot.size)}</small>
              </div>
              <button className="button" onClick={() => onRestore(snapshot.id)} disabled={busy}>
                <RotateCcw size={15} />この状態を復旧
              </button>
            </article>
          ))}
        </div>

        <footer className="recoveryFooter">
          <span>復旧すると現在の表示状態は置き換わります。素材ファイル自体は削除されません。</span>
          <button className="button primary" onClick={onDismiss} disabled={busy}>現在の保存を使う</button>
        </footer>
      </section>
    </div>
  );
}

function formatDate(value: number) {
  return new Intl.DateTimeFormat('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
