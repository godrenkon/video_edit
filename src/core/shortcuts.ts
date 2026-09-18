export type ShortcutAction =
  | 'search'
  | 'select-all'
  | 'undo'
  | 'redo'
  | 'split'
  | 'group'
  | 'ungroup'
  | 'duplicate'
  | 'copy'
  | 'paste'
  | 'nudge-left'
  | 'nudge-right'
  | 'play-pause'
  | 'ripple-delete'
  | 'delete';

export interface ShortcutDefinition {
  action: ShortcutAction;
  label: string;
  category: 'general' | 'edit' | 'selection';
  defaultBinding: string;
}

export type ShortcutOverrides = Partial<Record<ShortcutAction, string>>;

export const SHORTCUT_DEFINITIONS: ShortcutDefinition[] = [
  { action: 'search', label: 'プロジェクト全体検索', category: 'general', defaultBinding: 'Mod+Shift+F' },
  { action: 'play-pause', label: '再生 / 一時停止', category: 'general', defaultBinding: 'Space' },
  { action: 'undo', label: '元に戻す', category: 'edit', defaultBinding: 'Mod+Z' },
  { action: 'redo', label: 'やり直す', category: 'edit', defaultBinding: 'Mod+Shift+Z' },
  { action: 'split', label: '再生ヘッドで分割', category: 'edit', defaultBinding: 'Mod+K' },
  { action: 'duplicate', label: 'クリップを複製', category: 'edit', defaultBinding: 'Mod+D' },
  { action: 'copy', label: 'クリップをコピー', category: 'edit', defaultBinding: 'Mod+C' },
  { action: 'paste', label: 'クリップを貼り付け', category: 'edit', defaultBinding: 'Mod+V' },
  { action: 'ripple-delete', label: 'リップル削除', category: 'edit', defaultBinding: 'Shift+Delete' },
  { action: 'delete', label: '削除', category: 'edit', defaultBinding: 'Delete' },
  { action: 'select-all', label: '全クリップ選択', category: 'selection', defaultBinding: 'Mod+A' },
  { action: 'group', label: 'グループ化', category: 'selection', defaultBinding: 'Mod+G' },
  { action: 'ungroup', label: 'グループ解除', category: 'selection', defaultBinding: 'Mod+Shift+G' },
  { action: 'nudge-left', label: '1フレーム左へ', category: 'selection', defaultBinding: 'Alt+ArrowLeft' },
  { action: 'nudge-right', label: '1フレーム右へ', category: 'selection', defaultBinding: 'Alt+ArrowRight' },
];

const STORAGE_KEY = 'suiram-video-edit:shortcut-overrides:v1';
const ACTIONS = new Set<ShortcutAction>(SHORTCUT_DEFINITIONS.map((item) => item.action));

export interface ShortcutEventLike {
  key: string;
  code?: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}

export function shortcutBinding(action: ShortcutAction, overrides: ShortcutOverrides) {
  const override = overrides[action];
  if (override) return override;
  return SHORTCUT_DEFINITIONS.find((item) => item.action === action)?.defaultBinding ?? '';
}

export function shortcutMatches(
  event: ShortcutEventLike,
  action: ShortcutAction,
  overrides: ShortcutOverrides,
) {
  return shortcutFromEvent(event) === shortcutBinding(action, overrides);
}

export function shortcutFromEvent(event: ShortcutEventLike) {
  const key = normalizeKey(event);
  if (!key || isModifierKey(key)) return '';

  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push('Mod');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  parts.push(key);
  return parts.join('+');
}

export function setShortcutOverride(
  overrides: ShortcutOverrides,
  action: ShortcutAction,
  binding: string,
): ShortcutOverrides {
  const normalized = normalizeBinding(binding);
  if (!normalized) return overrides;
  const defaultBinding = SHORTCUT_DEFINITIONS.find((item) => item.action === action)?.defaultBinding;
  const next = { ...overrides };
  if (normalized === defaultBinding) delete next[action];
  else next[action] = normalized;
  return next;
}

export function shortcutConflicts(overrides: ShortcutOverrides) {
  const byBinding = new Map<string, ShortcutAction[]>();
  for (const definition of SHORTCUT_DEFINITIONS) {
    const binding = shortcutBinding(definition.action, overrides);
    if (!binding) continue;
    const items = byBinding.get(binding) ?? [];
    items.push(definition.action);
    byBinding.set(binding, items);
  }
  return new Map([...byBinding].filter(([, actions]) => actions.length > 1));
}

export function loadShortcutOverrides(
  storage: Pick<Storage, 'getItem'> | null = browserStorage(),
): ShortcutOverrides {
  if (!storage) return {};
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};
    const output: ShortcutOverrides = {};
    for (const [action, value] of Object.entries(parsed)) {
      if (!ACTIONS.has(action as ShortcutAction) || typeof value !== 'string') continue;
      const normalized = normalizeBinding(value);
      if (normalized) output[action as ShortcutAction] = normalized;
    }
    return output;
  } catch {
    return {};
  }
}

export function saveShortcutOverrides(
  overrides: ShortcutOverrides,
  storage: Pick<Storage, 'setItem'> | null = browserStorage(),
) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(overrides));
    return true;
  } catch {
    return false;
  }
}

export function shortcutDisplay(binding: string) {
  return binding
    .replace(/^Mod(?=\+|$)/, navigatorPlatformIsMac() ? '⌘' : 'Ctrl')
    .replace(/\+Shift/g, navigatorPlatformIsMac() ? '+⇧' : '+Shift')
    .replace(/\+Alt/g, navigatorPlatformIsMac() ? '+⌥' : '+Alt')
    .replace('ArrowLeft', '←')
    .replace('ArrowRight', '→')
    .replace('ArrowUp', '↑')
    .replace('ArrowDown', '↓')
    .replace('Delete', 'Del');
}

function normalizeBinding(value: string) {
  const parts = value.split('+').map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return '';
  const key = parts.at(-1) ?? '';
  if (!key || isModifierKey(key)) return '';
  const modifiers = new Set(parts.slice(0, -1));
  const ordered = [
    modifiers.has('Mod') ? 'Mod' : '',
    modifiers.has('Alt') ? 'Alt' : '',
    modifiers.has('Shift') ? 'Shift' : '',
    key,
  ].filter(Boolean);
  return ordered.join('+');
}

function normalizeKey(event: ShortcutEventLike) {
  if (event.code === 'Space' || event.key === ' ') return 'Space';
  const key = event.key;
  if (!key) return '';
  if (key === 'Esc') return 'Escape';
  if (key === 'Del') return 'Delete';
  if (key.startsWith('Arrow')) return key;
  if (key.length === 1) return key.toUpperCase();
  return key[0].toUpperCase() + key.slice(1);
}

function isModifierKey(value: string) {
  return value === 'Control' || value === 'Meta' || value === 'Alt' || value === 'Shift' || value === 'Mod';
}

function navigatorPlatformIsMac() {
  try {
    return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);
  } catch {
    return false;
  }
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
