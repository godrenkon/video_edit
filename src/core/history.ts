export interface HistoryEntry<T> {
  value: T;
  label: string;
  key?: string;
  at: number;
}

export interface HistoryResult<T> {
  value: T;
  label: string;
}

/**
 * Lightweight undo/redo history for serializable editor state.
 *
 * Important: media blobs, VideoFrame, AudioData and other runtime objects must
 * never be stored here. Project state should only contain serializable metadata.
 */
export class HistoryController<T> {
  private past: HistoryEntry<T>[] = [];
  private future: HistoryEntry<T>[] = [];

  constructor(
    private readonly limit = 120,
    private readonly coalesceMs = 750,
    private readonly clone: (value: T) => T = (value) => structuredClone(value),
  ) {}

  record(current: T, label = '編集', key?: string) {
    const now = Date.now();
    const last = this.past[this.past.length - 1];

    // Continuous drags/sliders should become one history step.
    if (key && last?.key === key && now - last.at <= this.coalesceMs) {
      last.at = now;
      this.future = [];
      return;
    }

    this.past.push({
      value: this.clone(current),
      label,
      key,
      at: now,
    });

    if (this.past.length > this.limit) {
      this.past.splice(0, this.past.length - this.limit);
    }

    this.future = [];
  }

  undo(current: T): HistoryResult<T> | null {
    const previous = this.past.pop();
    if (!previous) return null;

    this.future.push({
      value: this.clone(current),
      label: previous.label,
      key: previous.key,
      at: Date.now(),
    });

    return { value: this.clone(previous.value), label: previous.label };
  }

  redo(current: T): HistoryResult<T> | null {
    const next = this.future.pop();
    if (!next) return null;

    this.past.push({
      value: this.clone(current),
      label: next.label,
      key: next.key,
      at: Date.now(),
    });

    return { value: this.clone(next.value), label: next.label };
  }

  clear() {
    this.past = [];
    this.future = [];
  }

  get canUndo() {
    return this.past.length > 0;
  }

  get canRedo() {
    return this.future.length > 0;
  }

  get undoLabel() {
    return this.past[this.past.length - 1]?.label ?? null;
  }

  get redoLabel() {
    return this.future[this.future.length - 1]?.label ?? null;
  }

  get size() {
    return { past: this.past.length, future: this.future.length };
  }
}
