import { describe, expect, it } from 'vitest';
import {
  loadFavoriteEffects,
  parseFavoriteEffects,
  saveFavoriteEffects,
  serializeFavoriteEffects,
  toggleFavoriteEffect,
} from './effectFavorites';

describe('favorite effects', () => {
  it('deduplicates and sanitizes persisted effect kinds', () => {
    expect(parseFavoriteEffects(JSON.stringify(['blur', ' blur ', '', 'gain', 'blur']))).toEqual(['blur', 'gain']);
    expect(parseFavoriteEffects('{broken')).toEqual([]);
  });

  it('toggles one favorite without disturbing the others', () => {
    expect(toggleFavoriteEffect(['blur', 'gain'], 'blur')).toEqual(['gain']);
    expect(toggleFavoriteEffect(['blur'], 'saturation')).toEqual(['blur', 'saturation']);
  });

  it('round-trips through storage safely', () => {
    let raw = '';
    const writer = { setItem: (_key: string, value: string) => { raw = value; } };
    const reader = { getItem: () => raw };
    expect(saveFavoriteEffects(['gain', 'pan'], writer)).toBe(true);
    expect(loadFavoriteEffects(reader)).toEqual(['gain', 'pan']);
    expect(JSON.parse(serializeFavoriteEffects(['gain', 'gain']))).toEqual(['gain']);
  });
});
