import { useEffect, useState } from 'react';
import { Activity, Clapperboard, Download, FolderOpen, RefreshCcw, Save, X } from 'lucide-react';
import {
  probeCapabilities,
  type BrowserCapabilityReport,
  type CapabilityReport,
  type CapabilityState,
} from '../core/capabilities';
import '../capabilities.css';

interface Props {
  projectName: string;
  onProjectName: (name: string) => void;
  onSave: () => void;
  onBackup: () => void;
  onRender: () => void;
  onCancelRender: () => void;
  rendering: boolean;
  renderProgress: number | null;
  capabilities: CapabilityReport;
  saveState: string;
}

export function TopBar({
  projectName,
  onProjectName,
  onSave,
  onBackup,
  onRender,
  onCancelRender,
  rendering,
  renderProgress,
  capabilities,
  saveState,
}: Props) {
  const ready = Object.values(capabilities).filter(Boolean).length;
  const total = Object.keys(capabilities).length;
  const [diagnostics, setDiagnostics] = useState<BrowserCapabilityReport | null>(null);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [diagnosticsBusy, setDiagnosticsBusy] = useState(true);

  useEffect(() => {
    let active = true;
    setDiagnosticsBusy(true);
    probeCapabilities()
      .then((report) => {
        if (active) setDiagnostics(report);
      })
      .catch((error) => {
        console.warn('Browser capability probe failed', error);
      })
      .finally(() => {
        if (active) setDiagnosticsBusy(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const refreshDiagnostics = async () => {
    setDiagnosticsBusy(true);
    try {
      setDiagnostics(await probeCapabilities());
    } catch (error) {
      console.warn('Browser capability probe failed', error);
    } finally {
      setDiagnosticsBusy(false);
    }
  };

  const progressLabel = renderProgress === null ? '準備中' : `${Math.round(renderProgress * 100)}%`;

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
        <div className="capWrap">
          <button
            type="button"
            className={`capPill capButton ${diagnostics?.fallbackNotes.length ? 'warn' : ''}`}
            onClick={() => setDiagnosticsOpen((value) => !value)}
            aria-expanded={diagnosticsOpen}
            aria-label="ブラウザ機能診断を表示"
          >
            <Activity size={13} />
            {ready}/{total} engine
            <span>{diagnosticsBusy ? '診断中' : diagnostics ? '診断済み' : '簡易'}</span>
          </button>
          {diagnosticsOpen && (
            <CapabilityDiagnostics
              report={diagnostics}
              busy={diagnosticsBusy}
              onRefresh={refreshDiagnostics}
            />
          )}
        </div>
        <button className="button" onClick={onSave} disabled={rendering}><Save size={16} />保存</button>
        <button className="button" onClick={onBackup} disabled={rendering} title="プロジェクトJSONを端末へバックアップ">
          <Download size={16} />バックアップ
        </button>
        {rendering ? (
          <button className="button renderCancel" onClick={onCancelRender} title="動画書き出しをキャンセル">
            <X size={16} />中止 {progressLabel}
          </button>
        ) : (
          <button className="button primary" onClick={onRender} title="プロジェクトに保存した形式・解像度・画質設定で動画を書き出す">
            <Clapperboard size={16} />動画書き出し
          </button>
        )}
      </div>
    </header>
  );
}

function CapabilityDiagnostics({
  report,
  busy,
  onRefresh,
}: {
  report: BrowserCapabilityReport | null;
  busy: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="capDiagnostics" role="dialog" aria-label="ブラウザ機能診断">
      <div className="capDiagnosticsHeader">
        <div>
          <strong>ブラウザ機能診断</strong>
          <span>{report ? new Date(report.detectedAt).toLocaleTimeString() : '未取得'}</span>
        </div>
        <button type="button" className="capRefresh" onClick={onRefresh} disabled={busy}>
          <RefreshCcw size={13} className={busy ? 'spin' : undefined} />再診断
        </button>
      </div>

      {!report ? (
        <div className="capEmpty">{busy ? 'コーデックとストレージを確認しています…' : '詳細診断を取得できませんでした。'}</div>
      ) : (
        <>
          <div className="capSection">
            <strong>Storage</strong>
            <div className="capStorageRow"><span>OPFS</span><b>{report.base.opfs ? '利用可' : '利用不可'}</b></div>
            <div className="capStorageRow"><span>永続化</span><b>{report.storage.persisted === null ? '不明' : report.storage.persisted ? '有効' : '未許可'}</b></div>
            <div className="capStorageRow"><span>使用量</span><b>{formatStorage(report.storage.usage, report.storage.quota)}</b></div>
          </div>

          <div className="capSection">
            <strong>Video codecs</strong>
            <div className="capCodecGrid">
              {report.videoCodecs.map((codec) => (
                <div className="capCodecRow" key={codec.id}>
                  <span>{codec.label}</span>
                  <b>D {stateLabel(codec.decode)}</b>
                  <b>E {stateLabel(codec.encode)}</b>
                </div>
              ))}
            </div>
          </div>

          <div className="capSection">
            <strong>Audio codecs</strong>
            <div className="capCodecGrid">
              {report.audioCodecs.map((codec) => (
                <div className="capCodecRow" key={codec.id}>
                  <span>{codec.label}</span>
                  <b>D {stateLabel(codec.decode)}</b>
                  <b>E {stateLabel(codec.encode)}</b>
                </div>
              ))}
            </div>
          </div>

          <div className="capSection">
            <strong>Fallback</strong>
            {report.fallbackNotes.length === 0 ? (
              <div className="capOk">主要な高速経路は利用できます。</div>
            ) : (
              <div className="capNotes">
                {report.fallbackNotes.map((note) => <div key={note}>• {note}</div>)}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function stateLabel(state: CapabilityState) {
  if (state === 'supported') return 'OK';
  if (state === 'unsupported') return 'NG';
  if (state === 'error') return 'ERR';
  return '—';
}

function formatStorage(usage: number | null, quota: number | null) {
  if (usage === null && quota === null) return '不明';
  if (quota === null) return formatBytes(usage ?? 0);
  return `${formatBytes(usage ?? 0)} / ${formatBytes(quota)}`;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / 1024 ** index).toFixed(index >= 3 ? 1 : 0)} ${units[index]}`;
}
