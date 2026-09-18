import { Captions, FileAudio, FileImage, Film, FolderOpen, Palette, Plus, Search, Star, Trash2, Type } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { AssetMeta } from '../types/editor';

interface Props {
  assets: AssetMeta[];
  onImport: (files: File[]) => void;
  onImportFolder: () => void;
  folderImportSupported: boolean;
  onAdd: (assetId: string, mode: 'insert' | 'overwrite') => void;
  onDelete: (assetId: string) => void;
  onAssetMeta: (assetId: string, patch: Partial<AssetMeta>) => void;
  onRelink: (assetId: string, file: File) => void;
  proxyProgress: Record<string, number>;
  onGenerateProxy: (assetId: string) => void;
  onCancelProxy: (assetId: string) => void;
  onRemoveProxy: (assetId: string) => void;
  onCreateText: () => void;
  onCreateSubtitle: () => void;
  onCreateGenerator: () => void;
}

const iconFor = (kind: AssetMeta['kind']) => {
  if (kind === 'video') return <Film size={16} />;
  if (kind === 'audio') return <FileAudio size={16} />;
  return <FileImage size={16} />;
};

const formatBytes = (bytes: number) => {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

export function MediaLibrary({
  assets,
  onImport,
  onImportFolder,
  folderImportSupported,
  onAdd,
  onDelete,
  onAssetMeta,
  onRelink,
  proxyProgress,
  onGenerateProxy,
  onCancelProxy,
  onRemoveProxy,
  onCreateText,
  onCreateSubtitle,
  onCreateGenerator,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const relinkInput = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [editMode, setEditMode] = useState<'insert' | 'overwrite'>('insert');
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [kindFilter, setKindFilter] = useState<'all' | AssetMeta['kind']>('all');
  const [sortMode, setSortMode] = useState<'import' | 'name' | 'rating'>('import');
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return assets.filter((asset) => {
      if (favoritesOnly && !asset.favorite) return false;
      if (kindFilter !== 'all' && asset.kind !== kindFilter) return false;
      if (!needle) return true;
      const haystack = [
        asset.name,
        asset.kind,
        ...(asset.tags ?? []),
        asset.notes ?? '',
      ].join(' ').toLowerCase();
      return haystack.includes(needle);
    });
  }, [assets, favoritesOnly, kindFilter, query]);
  const visibleAssets = useMemo(() => {
    if (sortMode === 'import') return filtered;
    const copy = [...filtered];
    if (sortMode === 'name') return copy.sort((a, b) => a.name.localeCompare(b.name, 'ja'));
    return copy.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, 'ja'));
  }, [filtered, sortMode]);
  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? null;

  return (
    <aside className="panel mediaPanel">
      <div className="panelHeader">
        <div><strong>メディア</strong><span>{assets.length} assets</span></div>
        <button
          className="iconBtn"
          type="button"
          onClick={onImportFolder}
          disabled={!folderImportSupported}
          title={folderImportSupported ? 'フォルダから動画・画像・音声を一括読み込み' : 'このブラウザはフォルダ読み込みに未対応'}
        ><FolderOpen size={17} /></button>
        <button className="iconBtn" onClick={() => input.current?.click()} title="素材を読み込む"><Plus size={18} /></button>
        <input
          ref={input}
          hidden
          type="file"
          multiple
          accept="video/*,audio/*,image/*"
          onChange={(e) => {
            const files = Array.from(e.target.files ?? []);
            if (files.length) onImport(files);
            e.target.value = '';
          }}
        />
      </div>
      <div className="createTools" aria-label="生成クリップ">
        <button type="button" onClick={onCreateText} title="テキストクリップを追加"><Type size={14} /><span>テキスト</span></button>
        <button type="button" onClick={onCreateSubtitle} title="字幕クリップを追加"><Captions size={14} /><span>字幕</span></button>
        <button type="button" onClick={onCreateGenerator} title="背景ジェネレーターを追加"><Palette size={14} /><span>背景</span></button>
      </div>
      <div className="mediaEditMode" aria-label="タイムライン編集モード">
        <span>追加モード</span>
        <div>
          <button type="button" className={editMode === 'insert' ? 'active' : ''} onClick={() => setEditMode('insert')} title="再生ヘッド位置へ挿入し、後続クリップを押し出す">挿入</button>
          <button type="button" className={editMode === 'overwrite' ? 'active' : ''} onClick={() => setEditMode('overwrite')} title="再生ヘッド位置の既存区間を素材で置き換える">上書き</button>
        </div>
      </div>
      <div className="mediaSearchRow">
        <div className="searchBox"><Search size={14} /><input placeholder="名前・タグ・メモを検索" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
        <button type="button" className={`favoriteFilter ${favoritesOnly ? 'active' : ''}`} onClick={() => setFavoritesOnly((value) => !value)} title="お気に入りだけ表示"><Star size={13} fill={favoritesOnly ? 'currentColor' : 'none'} /></button>
      </div>
      <div className="mediaFilterRow">
        <select value={kindFilter} onChange={(e) => setKindFilter(e.target.value as typeof kindFilter)} aria-label="素材種別フィルター">
          <option value="all">すべて</option><option value="video">動画</option><option value="audio">音声</option><option value="image">画像</option>
        </select>
        <select value={sortMode} onChange={(e) => setSortMode(e.target.value as typeof sortMode)} aria-label="素材並び順">
          <option value="import">読み込み順</option><option value="name">名前順</option><option value="rating">評価順</option>
        </select>
        <span>{visibleAssets.length}/{assets.length}</span>
      </div>
      {selectedAsset && (
        <div className="assetMetaEditor">
          <div className="assetMetaHeader">
            <strong title={selectedAsset.name}>{selectedAsset.name}</strong>
            <button
              type="button"
              className={`favoriteAssetBtn ${selectedAsset.favorite ? 'active' : ''}`}
              onClick={() => onAssetMeta(selectedAsset.id, { favorite: !selectedAsset.favorite })}
              title="お気に入り"
            ><Star size={14} fill={selectedAsset.favorite ? 'currentColor' : 'none'} /></button>
          </div>
          <label><span>評価</span><select value={selectedAsset.rating ?? 0} onChange={(e) => onAssetMeta(selectedAsset.id, { rating: Number(e.target.value) })}>
            <option value={0}>なし</option><option value={1}>★</option><option value={2}>★★</option><option value={3}>★★★</option><option value={4}>★★★★</option><option value={5}>★★★★★</option>
          </select></label>
          <label><span>タグ</span><input value={(selectedAsset.tags ?? []).join(', ')} placeholder="例: B-roll, ゲーム, voice" onChange={(e) => onAssetMeta(selectedAsset.id, { tags: normalizeTags(e.target.value) })} /></label>
          <label><span>メモ</span><textarea rows={2} value={selectedAsset.notes ?? ''} onChange={(e) => onAssetMeta(selectedAsset.id, { notes: e.target.value || undefined })} /></label>
          <div className="assetRelink">
            <div className="assetRelinkStatus">
              <span>元素材</span>
              <b className={selectedAsset.objectUrl ? 'online' : 'missing'}>{selectedAsset.objectUrl ? '接続済み' : '見つかりません'}</b>
            </div>
            <button type="button" onClick={() => relinkInput.current?.click()}>
              {selectedAsset.objectUrl ? '元素材を差し替え' : '元素材を再リンク'}
            </button>
            <input
              ref={relinkInput}
              hidden
              type="file"
              accept={selectedAsset.kind === 'video' ? 'video/*' : selectedAsset.kind === 'audio' ? 'audio/*' : 'image/*'}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) onRelink(selectedAsset.id, file);
                event.target.value = '';
              }}
            />
          </div>
          {selectedAsset.kind === 'video' && (
            <div className="proxyEditor">
              <div className="proxyStatus">
                <span>Proxy</span>
                <b>{selectedAsset.proxyStorageName ? '有効' : proxyProgress[selectedAsset.id] !== undefined ? '生成中' : '未生成'}</b>
              </div>
              {proxyProgress[selectedAsset.id] !== undefined && (
                <progress max={1} value={proxyProgress[selectedAsset.id]} aria-label="proxy生成進捗" />
              )}
              <div className="proxyActions">
                {proxyProgress[selectedAsset.id] !== undefined ? (
                  <button type="button" onClick={() => onCancelProxy(selectedAsset.id)}>中止</button>
                ) : (
                  <button type="button" onClick={() => onGenerateProxy(selectedAsset.id)}>
                    {selectedAsset.proxyStorageName ? '再生成' : 'Proxy生成'}
                  </button>
                )}
                <button type="button" disabled={!selectedAsset.proxyStorageName} onClick={() => onRemoveProxy(selectedAsset.id)}>解除</button>
              </div>
            </div>
          )}
        </div>
      )}
      <div className="assetList">
        {visibleAssets.length === 0 && (
          <button className="emptyImport" onClick={() => input.current?.click()}>
            <Plus size={22} />
            <strong>素材を追加</strong>
            <span>動画・画像・音声をここに読み込む</span>
          </button>
        )}
        {visibleAssets.map((asset) => (
          <div className={`assetRow ${selectedAssetId === asset.id ? 'selected' : ''}`} key={asset.id} onClick={() => setSelectedAssetId(asset.id)} onDoubleClick={() => onAdd(asset.id, editMode)}>
            <div className={`assetIcon ${asset.kind}`}>{iconFor(asset.kind)}</div>
            <div className="assetText">
              <strong title={asset.name}>{asset.favorite ? '★ ' : ''}{asset.name}</strong>
              <span>{asset.kind} · {formatBytes(asset.size)}{asset.duration ? ` · ${asset.duration.toFixed(1)}s` : ''}{asset.proxyStorageName ? ' · proxy' : ''}{!asset.objectUrl ? ' · offline' : ''}</span>
            </div>
            <button className="miniBtn" title={editMode === 'insert' ? '挿入編集でタイムラインに追加' : '上書き編集でタイムラインに追加'} onClick={() => onAdd(asset.id, editMode)}><Plus size={14} /></button>
            <button className="miniBtn danger" title="素材を削除" onClick={() => onDelete(asset.id)}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </aside>
  );
}


function normalizeTags(value: string) {
  return [...new Set(value.split(',').map((tag) => tag.trim()).filter(Boolean))].slice(0, 24);
}
