import { uid } from './project';
import type { ClipMask } from '../types/editor';

export function createClipMask(kind: ClipMask['kind']): ClipMask {
  return {
    id: uid('mask'),
    kind,
    x: 0.15,
    y: 0.15,
    width: 0.7,
    height: 0.7,
  };
}

export function sanitizeClipMasks(value: unknown): ClipMask[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result: ClipMask[] = [];
  const ids = new Set<string>();

  for (let index = 0; index < value.length; index += 1) {
    const raw = value[index];
    if (!isRecord(raw)) continue;
    const normalized = normalizeMask(raw, index);
    if (!normalized) continue;

    let id = normalized.id;
    if (ids.has(id)) id = `mask_migrated_${index}`;
    ids.add(id);
    result.push({ ...normalized, id });
  }

  return result.length ? result : undefined;
}

export function updateClipMask(
  masks: ClipMask[] | undefined,
  maskId: string,
  patch: Partial<Omit<ClipMask, 'id'>>,
): ClipMask[] {
  const current = masks ?? [];
  return current.map((mask, index) => {
    if (mask.id !== maskId) return mask;
    return normalizeMask({ ...mask, ...patch }, index) ?? mask;
  });
}

export function removeClipMask(masks: ClipMask[] | undefined, maskId: string): ClipMask[] | undefined {
  const next = (masks ?? []).filter((mask) => mask.id !== maskId);
  return next.length ? next : undefined;
}

function normalizeMask(raw: Record<string, unknown>, index: number): ClipMask | null {
  const kind = raw.kind === 'ellipse' ? 'ellipse' : raw.kind === 'rectangle' ? 'rectangle' : null;
  if (!kind) return null;

  const x = clampFinite(raw.x, 0, 0.999, 0.15);
  const y = clampFinite(raw.y, 0, 0.999, 0.15);
  const width = clampFinite(raw.width, 0.001, Math.max(0.001, 1 - x), 0.7);
  const height = clampFinite(raw.height, 0.001, Math.max(0.001, 1 - y), 0.7);

  return {
    id: typeof raw.id === 'string' && raw.id.trim() ? raw.id.trim().slice(0, 160) : `mask_migrated_${index}`,
    kind,
    x,
    y,
    width,
    height,
  };
}

function clampFinite(value: unknown, min: number, max: number, fallback: number) {
  const numeric = typeof value === 'number' ? value : Number(value);
  const safe = Number.isFinite(numeric) ? numeric : fallback;
  return Math.min(max, Math.max(min, safe));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
