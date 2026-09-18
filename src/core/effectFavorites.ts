const STORAGE_KEY = 'suiram-video-edit:favorite-effects:v1';
const MAX_FAVORITES = 64;

export function parseFavoriteEffects(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return [...new Set(value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0))]
      .map((item) => item.trim().slice(0, 120))
      .slice(0, MAX_FAVORITES);
  } catch {
    return [];
  }
}

export function serializeFavoriteEffects(kinds: Iterable<string>) {
  return JSON.stringify([...new Set([...kinds].map((kind) => kind.trim()).filter(Boolean))].slice(0, MAX_FAVORITES));
}

export function loadFavoriteEffects(storage: Pick<Storage, 'getItem'> | null = browserStorage()) {
  if (!storage) return [];
  try {
    return parseFavoriteEffects(storage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveFavoriteEffects(
  kinds: Iterable<string>,
  storage: Pick<Storage, 'setItem'> | null = browserStorage(),
) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, serializeFavoriteEffects(kinds));
    return true;
  } catch {
    return false;
  }
}

export function toggleFavoriteEffect(kinds: Iterable<string>, kind: string) {
  const normalized = kind.trim();
  const current = new Set([...kinds].map((item) => item.trim()).filter(Boolean));
  if (!normalized) return [...current];
  if (current.has(normalized)) current.delete(normalized);
  else current.add(normalized);
  return [...current].slice(0, MAX_FAVORITES);
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
