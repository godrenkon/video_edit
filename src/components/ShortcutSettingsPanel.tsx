import { RotateCcw } from 'lucide-react';
import {
  SHORTCUT_DEFINITIONS,
  setShortcutOverride,
  shortcutBinding,
  shortcutConflicts,
  shortcutDisplay,
  shortcutFromEvent,
  type ShortcutAction,
  type ShortcutOverrides,
} from '../core/shortcuts';
import '../shortcut-settings.css';

export function ShortcutSettingsPanel({
  overrides,
  onChange,
}: {
  overrides: ShortcutOverrides;
  onChange: (next: ShortcutOverrides) => void;
}) {
  const conflicts = shortcutConflicts(overrides);
  const conflictingActions = new Set([...conflicts.values()].flat());

  const capture = (action: ShortcutAction, event: React.KeyboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      event.currentTarget.blur();
      return;
    }
    const binding = shortcutFromEvent(event.nativeEvent);
    if (!binding) return;
    onChange(setShortcutOverride(overrides, action, binding));
    event.currentTarget.blur();
  };

  const resetOne = (action: ShortcutAction) => {
    const next = { ...overrides };
    delete next[action];
    onChange(next);
  };

  return (
    <section className="shortcutSettings">
      <div className="shortcutSettingsHeader">
        <div><strong>ショートカット</strong><span>入力欄を選んで新しいキーを押す</span></div>
        <button type="button" onClick={() => onChange({})} disabled={Object.keys(overrides).length === 0}>
          <RotateCcw size={11} />すべて初期化
        </button>
      </div>

      <div className="shortcutRows">
        {SHORTCUT_DEFINITIONS.map((definition) => {
          const binding = shortcutBinding(definition.action, overrides);
          const changed = Boolean(overrides[definition.action]);
          const conflict = conflictingActions.has(definition.action);
          return (
            <div className={`shortcutRow ${conflict ? 'conflict' : ''}`} key={definition.action}>
              <div className="shortcutLabel">
                <strong>{definition.label}</strong>
                <span>{categoryLabel(definition.category)}{conflict ? ' · キー競合' : ''}</span>
              </div>
              <input
                readOnly
                value={shortcutDisplay(binding)}
                onKeyDown={(event) => capture(definition.action, event)}
                onFocus={(event) => event.currentTarget.select()}
                aria-label={`${definition.label}のショートカット`}
                title="フォーカスして新しいショートカットを押してください"
              />
              <button
                type="button"
                className="shortcutReset"
                disabled={!changed}
                onClick={() => resetOne(definition.action)}
                title="初期設定へ戻す"
              >
                <RotateCcw size={11} />
              </button>
            </div>
          );
        })}
      </div>
      {conflicts.size > 0 && (
        <div className="shortcutConflictNote">同じキーが複数操作へ割り当てられています。競合行のどちらかを変更してください。</div>
      )}
    </section>
  );
}

function categoryLabel(category: 'general' | 'edit' | 'selection') {
  if (category === 'general') return '一般';
  if (category === 'selection') return '選択';
  return '編集';
}
