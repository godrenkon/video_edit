import { Captions, FileAudio, FileImage, Film, Palette, Plus, Search, Trash2, Type } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import type { AssetMeta } from '../types/editor';

interface Props {
  assets: AssetMeta[];
  onImport: (files: File[]) => void;
  onAdd: (assetId: string) => void;
  onDelete: (assetId: string) => void;
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
  onAdd,
  onDelete,
  onCreateText,
  onCreateSubtitle,
  onCreateGenerator,
}: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const filtered = useMemo(
    () => assets.filter((asset) => asset.name.toLowerCase().includes(query.toLowerCase())),
    [assets, query],
  );

  return (
    <aside className="panel mediaPanel">
      <div className="panelHeader">
        <div><strong>メディア</strong><span>{assets.length} assets</span></div>
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
      <div className="searchBox"><Search size={14} /><input placeholder="素材を検索" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
      <div className="assetList">
        {filtered.length === 0 && (
          <button className="emptyImport" onClick={() => input.current?.click()}>
            <Plus size={22} />
            <strong>素材を追加</strong>
            <span>動画・画像・音声をここに読み込む</span>
          </button>
        )}
        {filtered.map((asset) => (
          <div className="assetRow" key={asset.id} onDoubleClick={() => onAdd(asset.id)}>
            <div className={`assetIcon ${asset.kind}`}>{iconFor(asset.kind)}</div>
            <div className="assetText">
              <strong title={asset.name}>{asset.name}</strong>
              <span>{asset.kind} · {formatBytes(asset.size)}{asset.duration ? ` · ${asset.duration.toFixed(1)}s` : ''}</span>
            </div>
            <button className="miniBtn" title="タイムラインに追加" onClick={() => onAdd(asset.id)}><Plus size={14} /></button>
            <button className="miniBtn danger" title="素材を削除" onClick={() => onDelete(asset.id)}><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </aside>
  );
}
