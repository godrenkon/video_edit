import { Captions, FileAudio, FileImage, Film, FolderOpen, Palette, Plus, Search, Trash2, Type, Unplug, WandSparkles } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AssetBin, AssetMeta } from '../types/editor';
import type { LowerThirdPreset } from '../core/project';
import { MicrophoneRecorder } from './MicrophoneRecorder';
import { ScreenRecorder } from './ScreenRecorder';
import { CameraRecorder } from './CameraRecorder';

interface Props {
  assets: AssetMeta[];
  assetBins: AssetBin[];
  focusAssetId?: string | null;
  focusBinId?: string | null;
  focusToken?: number;
  timelineTime: number;
  onImport: (files: File[]) => void | Promise<void>;
  onPunchInVoiceover: (file: File, startTime: number) => void | Promise<void>;
  onPunchInPlayback: (active: boolean) => void;
  onImportFolder: () => void;
  folderImportSupported: boolean;
  onAdd: (assetId: string, mode: 'insert' | 'overwrite') => void;
  onDelete: (assetId: string) => void;
  onAssetMeta: (assetId: string, patch: Partial<AssetMeta>) => void;
  onCreateBin: (name: string) => void;
  onRenameBin: (binId: string, name: string) => void;
  onDeleteBin: (binId: string) => void;
  onAssignBin: (assetId: string, binId?: string) => void;
  onRelink: (assetId: string, file: File) => void;
  proxyProgress: Record<string, number>;
  onGenerateProxy: (assetId: string) => void;
  onCancelProxy: (assetId: string) => void;
  onRemoveProxy: (assetId: string) => void;
  onCreateText: () => void;
  onCreateLowerThird: (preset: LowerThirdPreset) => void;
  onCreateSubtitle: () => void;
  onCreateGenerator: () => void;
}

interface AssetMenuState {
  assetId: string;
  x: number;
  y: number;
}

const iconFor = (kind: AssetMeta['kind']) => {
  if (kind === 'video') return <Film size={16} />;
  if (kind === 'audio') return <FileAudio size={16} />;
  return <FileImage size={16} />;
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
  return (bytes / 1024 / 1024).toFixed(1) + ' MB';
};

export function MediaLibrary({
  assets,
  focusAssetId,
  focusToken,
  timelineTime,
  onImport,
  onPunchInVoiceover,
  onPunchInPlayback,
  onImportFolder,
  folderImportSupported,
  onAdd,
  onDelete,
  onRelink,
  proxyProgress,
  onGenerateProxy,
  onCancelProxy,
  onRemoveProxy,
  onCreateText,
  onCreateLowerThird,
  onCreateSubtitle,
  onCreateGenerator,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const relinkInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [editMode, setEditMode] = useState<'insert' | 'overwrite'>('insert');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [kindFilter, setKindFilter] = useState<'all' | AssetMeta['kind']>('all');
  const [lowerThirdPreset, setLowerThirdPreset] = useState<LowerThirdPreset>('clean');
  const [contextMenu, setContextMenu] = useState<AssetMenuState | null>(null);
  const [relinkAssetId, setRelinkAssetId] = useState<string | null>(null);

  useEffect(() => {
    if (focusAssetId && assets.some((item) => item.id === focusAssetId)) setSelectedAssetId(focusAssetId);
  }, [assets, focusAssetId, focusToken]);

  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('pointerdown', close);
    window.addEventListener('blur', close);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('pointerdown', close);
      window.removeEventListener('blur', close);
      window.removeEventListener('resize', close);
    };
  }, []);

  const visibleAssets = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assets.filter((asset) => {
      if (kindFilter !== 'all' && asset.kind !== kindFilter) return false;
      if (!needle) return true;
      return [asset.name, asset.kind, ...(asset.tags ?? []), asset.notes ?? ''].join(' ').toLowerCase().includes(needle);
    });
  }, [assets, kindFilter, query]);

  const menuAsset = contextMenu ? assets.find((asset) => asset.id === contextMenu.assetId) ?? null : null;

  const requestRelink = (assetId: string) => {
    setRelinkAssetId(assetId);
    setContextMenu(null);
    relinkInput.current?.click();
  };

  const showContextMenu = (event: React.MouseEvent, assetId: string) => {
    event.preventDefault();
    event.stopPropagation();
    const menuWidth = 230;
    const menuHeight = 250;
    setSelectedAssetId(assetId);
    setContextMenu({
      assetId,
      x: Math.max(8, Math.min(window.innerWidth - menuWidth - 8, event.clientX)),
      y: Math.max(8, Math.min(window.innerHeight - menuHeight - 8, event.clientY)),
    });
  };

  return (
    <aside className="panel mediaPanel">
      <div className="panelHeader">
        <div><strong>メディア</strong><span>{assets.length} assets</span></div>
        <button
          className="iconBtn"
          type="button"
          onClick={onImportFolder}
          disabled={!folderImportSupported}
          title={folderImportSupported ? 'フォルダから一括読み込み' : 'このブラウザはフォルダ読み込みに未対応'}
        ><FolderOpen size={17} /></button>
        <button className="iconBtn" type="button" onClick={() => input.current?.click()} title="素材を読み込む" aria-label="素材を読み込む"><Plus size={18} /></button>
        <input
          ref={input}
          hidden
          type="file"
          multiple
          accept="video/*,audio/*,image/*"
          onChange={(event) => {
            const files = Array.from(event.target.files ?? []);
            if (files.length) void onImport(files);
            event.currentTarget.value = '';
          }}
        />
        <input
          ref={relinkInput}
          hidden
          type="file"
          accept={relinkAssetId ? assets.find((asset) => asset.id === relinkAssetId)?.kind === 'video' ? 'video/*' : assets.find((asset) => asset.id === relinkAssetId)?.kind === 'audio' ? 'audio/*' : 'image/*' : 'video/*,audio/*,image/*'}
          onChange={(event) => {
            const file = event.target.files?.[0];
            const assetId = relinkAssetId;
            if (file && assetId) onRelink(assetId, file);
            setRelinkAssetId(null);
            event.currentTarget.value = '';
          }}
        />
      </div>

      <div className="createTools" aria-label="生成クリップ">
        <button type="button" onClick={onCreateText} title="テキストクリップを追加"><Type size={14} /><span>テキスト</span></button>
        <button type="button" onClick={onCreateSubtitle} title="字幕クリップを追加"><Captions size={14} /><span>字幕</span></button>
        <button type="button" onClick={onCreateGenerator} title="背景ジェネレーターを追加"><Palette size={14} /><span>背景</span></button>
      </div>

      <div className="mediaQuickTools">
        <details>
          <summary>録音・キャプチャ</summary>
          <MicrophoneRecorder onImport={onImport} timelineTime={timelineTime} onPunchIn={onPunchInVoiceover} onPunchInPlayback={onPunchInPlayback} />
          <ScreenRecorder onImport={onImport} />
          <CameraRecorder onImport={onImport} />
        </details>
        <div className="lowerThirdCreate">
          <span>下部テロップ</span>
          <select value={lowerThirdPreset} onChange={(event) => setLowerThirdPreset(event.target.value as LowerThirdPreset)}>
            <option value="clean">Clean</option>
            <option value="accent">Accent</option>
            <option value="minimal">Minimal</option>
          </select>
          <button type="button" onClick={() => onCreateLowerThird(lowerThirdPreset)}>追加</button>
        </div>
      </div>

      <div className="mediaEditMode" aria-label="タイムライン編集モード">
        <span>配置</span>
        <div>
          <button type="button" className={editMode === 'insert' ? 'active' : ''} onClick={() => setEditMode('insert')} title="再生ヘッド位置へ非破壊で配置。重なる場合は自動で追加トラックを使用">配置</button>
          <button type="button" className={editMode === 'overwrite' ? 'active' : ''} onClick={() => setEditMode('overwrite')} title="選択中または先頭の同種トラックへ上書き">上書き</button>
        </div>
      </div>

      <div className="mediaSearchRow">
        <div className="searchBox"><Search size={14} /><input placeholder="素材を検索" value={query} onChange={(event) => setQuery(event.target.value)} /></div>
      </div>
      <div className="mediaFilterRow simple">
        <select value={kindFilter} onChange={(event) => setKindFilter(event.target.value as typeof kindFilter)} aria-label="素材種別フィルター">
          <option value="all">すべて</option>
          <option value="video">動画</option>
          <option value="audio">音声</option>
          <option value="image">画像</option>
        </select>
        <span>{visibleAssets.length}/{assets.length}</span>
      </div>

      <div className="assetList" onScroll={() => setContextMenu(null)}>
        {visibleAssets.length === 0 && (
          <button className="emptyImport" type="button" onClick={() => input.current?.click()}>
            <Plus size={22} />
            <strong>素材を追加</strong>
            <span>複数ファイルを一度に読み込めます</span>
          </button>
        )}
        {visibleAssets.map((asset) => (
          <div
            className={'assetRow ' + (selectedAssetId === asset.id ? 'selected' : '')}
            key={asset.id}
            onClick={() => setSelectedAssetId(asset.id)}
            onDoubleClick={() => onAdd(asset.id, editMode)}
            onContextMenu={(event) => showContextMenu(event, asset.id)}
            title="ダブルクリックで配置 / 右クリックでメニュー"
          >
            <div className={'assetIcon ' + asset.kind}>{iconFor(asset.kind)}</div>
            <div className="assetText">
              <strong title={asset.name}>{asset.name}</strong>
              <span>{asset.kind} · {formatBytes(asset.size)}{asset.duration ? ' · ' + asset.duration.toFixed(1) + 's' : ''}{asset.proxyStorageName ? ' · proxy' : ''}{!asset.objectUrl ? ' · offline' : ''}</span>
            </div>
            <button
              className="miniBtn"
              type="button"
              title={editMode === 'insert' ? 'タイムラインへ配置' : 'タイムラインへ上書き'}
              aria-label={asset.name + 'をタイムラインへ追加'}
              onClick={(event) => {
                event.stopPropagation();
                onAdd(asset.id, editMode);
              }}
            ><Plus size={14} /></button>
            <button
              className="miniBtn danger"
              type="button"
              title="素材を削除"
              aria-label={asset.name + 'を削除'}
              onClick={(event) => {
                event.stopPropagation();
                setSelectedAssetId((current) => current === asset.id ? null : current);
                onDelete(asset.id);
              }}
            ><Trash2 size={14} /></button>
          </div>
        ))}
      </div>

      {contextMenu && menuAsset && (
        <div
          className="editorContextMenu mediaContextMenu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onPointerDown={(event) => event.stopPropagation()}
          role="menu"
        >
          <button type="button" onClick={() => { onAdd(menuAsset.id, 'insert'); setContextMenu(null); }}><Plus size={14} />タイムラインへ配置</button>
          <button type="button" onClick={() => { onAdd(menuAsset.id, 'overwrite'); setContextMenu(null); }}><WandSparkles size={14} />上書き</button>
          {menuAsset.kind === 'video' && (
            proxyProgress[menuAsset.id] !== undefined
              ? <button type="button" onClick={() => { onCancelProxy(menuAsset.id); setContextMenu(null); }}>Proxy生成を中止</button>
              : menuAsset.proxyStorageName
                ? <button type="button" onClick={() => { onRemoveProxy(menuAsset.id); setContextMenu(null); }}><Unplug size={14} />Proxyを解除</button>
                : <button type="button" onClick={() => { onGenerateProxy(menuAsset.id); setContextMenu(null); }}>Proxyを生成</button>
          )}
          <button type="button" onClick={() => requestRelink(menuAsset.id)}>元素材を再リンク</button>
          <hr />
          <button type="button" className="danger" onClick={() => { onDelete(menuAsset.id); setContextMenu(null); }}><Trash2 size={14} />素材を削除</button>
        </div>
      )}
    </aside>
  );
}
