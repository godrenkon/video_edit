import { describe, expect, it } from 'vitest';
import type { AssetMeta } from '../types/editor';
import {
  createZundamonCharacterPreset,
  loadZundamonCharacterPresets,
  normalizeZundamonPresetName,
  resolveZundamonCharacterPreset,
  saveZundamonCharacterPresets,
} from './zundamonPresets';

const assets: AssetMeta[] = [
  { id: 'closed', name: 'closed.png', kind: 'image', mime: 'image/png', size: 1, duration: 0, storageName: 'closed.png' },
  { id: 'open', name: 'open.png', kind: 'image', mime: 'image/png', size: 1, duration: 0, storageName: 'open.png' },
  { id: 'a', name: 'a.png', kind: 'image', mime: 'image/png', size: 1, duration: 0, storageName: 'a.png' },
];

describe('Zundamon character presets', () => {
  it('captures character image refs and animation settings', () => {
    const preset = createZundamonCharacterPreset('  Main   Character ', {
      closed: 'closed',
      half: '',
      open: 'open',
      blink: '',
      vowelA: 'a',
      vowelI: '',
      vowelU: '',
      vowelE: '',
      vowelO: '',
      blinkEvery: 5,
      bobAmount: 12,
      bobSpeed: 0.9,
    }, assets, new Date('2026-01-01T00:00:00.000Z'));

    expect(preset.name).toBe('Main Character');
    expect(preset.assets.closed).toEqual({ id: 'closed', name: 'closed.png' });
    expect(preset.assets.vowels?.a).toEqual({ id: 'a', name: 'a.png' });
    expect(preset).toMatchObject({ blinkEvery: 5, bobAmount: 12, bobSpeed: 0.9 });
  });

  it('resolves by id first and falls back to asset name', () => {
    const preset = createZundamonCharacterPreset('Character', {
      closed: 'closed',
      half: '',
      open: 'open',
      blink: '',
      vowelA: 'a',
      vowelI: '',
      vowelU: '',
      vowelE: '',
      vowelO: '',
      blinkEvery: 4,
      bobAmount: 8,
      bobSpeed: 0.7,
    }, assets);

    const movedAssets: AssetMeta[] = [
      { ...assets[0], id: 'closed-new' },
      { ...assets[1], id: 'open-new' },
      { ...assets[2], id: 'a-new' },
    ];
    expect(resolveZundamonCharacterPreset(preset, movedAssets)).toMatchObject({
      closed: 'closed-new',
      open: 'open-new',
      vowelA: 'a-new',
    });
  });

  it('round-trips through storage and clamps malformed settings', () => {
    let raw = '';
    const writer = { setItem: (_key: string, value: string) => { raw = value; } };
    const reader = { getItem: () => raw };
    const preset = createZundamonCharacterPreset('Saved', {
      closed: 'closed',
      half: '',
      open: 'open',
      blink: '',
      vowelA: '',
      vowelI: '',
      vowelU: '',
      vowelE: '',
      vowelO: '',
      blinkEvery: 99,
      bobAmount: -2,
      bobSpeed: 99,
    }, assets);
    expect(saveZundamonCharacterPresets([preset], writer)).toBe(true);
    expect(loadZundamonCharacterPresets(reader)[0]).toMatchObject({
      name: 'Saved',
      blinkEvery: 10,
      bobAmount: 0,
      bobSpeed: 3,
    });
  });

  it('normalizes names', () => {
    expect(normalizeZundamonPresetName('  A\n  B  ')).toBe('A B');
  });
});
