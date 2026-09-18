import { describe, expect, it } from 'vitest';
import {
  loadShortcutOverrides,
  saveShortcutOverrides,
  setShortcutOverride,
  shortcutBinding,
  shortcutConflicts,
  shortcutFromEvent,
  shortcutMatches,
} from './shortcuts';

describe('customizable shortcuts', () => {
  it('normalizes modifier order and keyboard keys', () => {
    expect(shortcutFromEvent({ key: 'f', ctrlKey: true, shiftKey: true })).toBe('Mod+Shift+F');
    expect(shortcutFromEvent({ key: ' ', code: 'Space' })).toBe('Space');
    expect(shortcutFromEvent({ key: 'ArrowLeft', altKey: true })).toBe('Alt+ArrowLeft');
    expect(shortcutFromEvent({ key: 'Shift', shiftKey: true })).toBe('');
  });

  it('uses defaults until an action is overridden', () => {
    expect(shortcutBinding('split', {})).toBe('Mod+K');
    const overrides = setShortcutOverride({}, 'split', 'Mod+Shift+S');
    expect(shortcutBinding('split', overrides)).toBe('Mod+Shift+S');
    expect(shortcutMatches({ key: 's', ctrlKey: true, shiftKey: true }, 'split', overrides)).toBe(true);
  });

  it('drops redundant overrides that match the default', () => {
    const overrides = setShortcutOverride({ split: 'Mod+Shift+S' }, 'split', 'Mod+K');
    expect(overrides.split).toBeUndefined();
  });

  it('detects collisions across effective bindings', () => {
    const overrides = setShortcutOverride({}, 'split', 'Mod+Shift+F');
    const conflicts = shortcutConflicts(overrides);
    expect(conflicts.get('Mod+Shift+F')).toEqual(expect.arrayContaining(['search', 'split']));
  });

  it('round-trips only known valid actions through storage', () => {
    let raw = '';
    const writer = { setItem: (_key: string, value: string) => { raw = value; } };
    const reader = { getItem: () => raw };
    expect(saveShortcutOverrides({ split: 'Mod+Shift+S' }, writer)).toBe(true);
    expect(loadShortcutOverrides(reader)).toEqual({ split: 'Mod+Shift+S' });

    expect(loadShortcutOverrides({
      getItem: () => JSON.stringify({ split: 'Alt+K', unknown: 'Mod+X', search: 42 }),
    })).toEqual({ split: 'Alt+K' });
  });
});
