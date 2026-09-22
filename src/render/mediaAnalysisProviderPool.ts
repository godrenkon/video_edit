export interface MediaProviderEntry<T> {
  provider: T;
  lastUsed: number;
  activeCount: number;
}

export function pruneIdleMediaProviders<T extends { close(): void }>(
  providers: Map<string, MediaProviderEntry<T>>,
  max: number,
  currentKey?: string,
) {
  if (providers.size <= max) return;
  const candidates = [...providers.entries()]
    .filter(([key, entry]) => key !== currentKey && entry.activeCount === 0)
    .sort((a, b) => a[1].lastUsed - b[1].lastUsed);
  let excess = providers.size - max;
  for (const [key, entry] of candidates) {
    if (excess <= 0) break;
    entry.provider.close();
    providers.delete(key);
    excess -= 1;
  }
}
