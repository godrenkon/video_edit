import { FileAudio, FileImage, Film, Flag, Folder, Layers3, MessageSquareText, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { searchProject, type ProjectSearchResult } from '../core/projectSearch';
import type { Project } from '../types/editor';
import '../search-everything.css';

export function SearchEverythingPalette({
  project,
  open,
  onClose,
  onNavigate,
}: {
  project: Project;
  open: boolean;
  onClose: () => void;
  onNavigate: (result: ProjectSearchResult) => void;
}) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const results = useMemo(() => searchProject(project, query), [project, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    setActiveIndex((index) => Math.max(0, Math.min(index, Math.max(0, results.length - 1))));
  }, [results.length]);

  if (!open) return null;

  const activate = (result: ProjectSearchResult | undefined) => {
    if (!result) return;
    onNavigate(result);
    onClose();
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, Math.min(results.length - 1, index + 1)));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(0, index - 1));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      activate(results[activeIndex]);
    }
  };

  return (
    <div className="searchEverythingBackdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section className="searchEverythingPalette" role="dialog" aria-modal="true" aria-label="プロジェクト全体検索">
        <div className="searchEverythingInputRow">
          <Search size={16} />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="素材・クリップ・字幕・トラック・マーカーを検索"
            aria-label="プロジェクト全体検索"
          />
          <kbd>Ctrl/Cmd+Shift+F</kbd>
          <button type="button" onClick={onClose} title="閉じる"><X size={15} /></button>
        </div>
        <div className="searchEverythingResults" role="listbox">
          {!query.trim() && (
            <div className="searchEverythingEmpty">検索語を入力すると、プロジェクト全体から候補を表示します。</div>
          )}
          {query.trim() && results.length === 0 && (
            <div className="searchEverythingEmpty">一致する項目はありません。</div>
          )}
          {results.map((result, index) => (
            <button
              type="button"
              key={result.id}
              className={`searchEverythingResult ${index === activeIndex ? 'active' : ''}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => activate(result)}
              role="option"
              aria-selected={index === activeIndex}
            >
              <span className={`searchEverythingIcon ${result.kind}`}>{resultIcon(result, project)}</span>
              <span className="searchEverythingText">
                <strong>{result.title}</strong>
                <span>{kindLabel(result.kind)}{result.subtitle ? ` · ${result.subtitle}` : ''}</span>
              </span>
              {typeof result.time === 'number' && <time>{formatTime(result.time)}</time>}
            </button>
          ))}
        </div>
        <footer className="searchEverythingFooter">
          <span>↑↓ 移動</span><span>Enter 開く</span><span>Esc 閉じる</span><b>{results.length}件</b>
        </footer>
      </section>
    </div>
  );
}

function resultIcon(result: ProjectSearchResult, project: Project) {
  if (result.kind === 'marker') return <Flag size={15} />;
  if (result.kind === 'transcript') return <MessageSquareText size={15} />;
  if (result.kind === 'track') return <Layers3 size={15} />;
  if (result.kind === 'bin') return <Folder size={15} />;
  if (result.kind === 'asset') {
    const asset = project.assets.find((item) => item.id === result.assetId);
    if (asset?.kind === 'audio') return <FileAudio size={15} />;
    if (asset?.kind === 'image') return <FileImage size={15} />;
  }
  return <Film size={15} />;
}

function kindLabel(kind: ProjectSearchResult['kind']) {
  if (kind === 'asset') return '素材';
  if (kind === 'clip') return 'クリップ';
  if (kind === 'track') return 'トラック';
  if (kind === 'marker') return 'マーカー';
  if (kind === 'transcript') return 'トランスクリプト';
  return '素材ビン';
}

function formatTime(value: number) {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const minutes = Math.floor(safe / 60);
  const seconds = safe - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(2).padStart(5, '0')}`;
}
