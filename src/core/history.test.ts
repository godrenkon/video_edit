import { describe, expect, it } from 'vitest';
import { HistoryController } from './history';

type State = { value: number };

const cloneState = (state: State): State => ({ ...state });

describe('HistoryController', () => {
  it('undoes and redoes serializable editor state', () => {
    const history = new HistoryController<State>(120, 750, cloneState);

    history.record({ value: 0 }, 'change');

    const undone = history.undo({ value: 1 });
    expect(undone?.value).toEqual({ value: 0 });
    expect(undone?.label).toBe('change');
    expect(history.canRedo).toBe(true);

    const redone = history.redo({ value: 0 });
    expect(redone?.value).toEqual({ value: 1 });
    expect(redone?.label).toBe('change');
  });

  it('clears redo history when a new edit is recorded', () => {
    const history = new HistoryController<State>(120, 750, cloneState);

    history.record({ value: 0 }, 'first');
    history.undo({ value: 1 });
    expect(history.canRedo).toBe(true);

    history.record({ value: 2 }, 'new edit');
    expect(history.canRedo).toBe(false);
  });

  it('respects the configured history limit', () => {
    const history = new HistoryController<State>(2, 0, cloneState);

    history.record({ value: 0 }, '0');
    history.record({ value: 1 }, '1');
    history.record({ value: 2 }, '2');

    expect(history.size.past).toBe(2);
    expect(history.undo({ value: 3 })?.value).toEqual({ value: 2 });
    expect(history.undo({ value: 2 })?.value).toEqual({ value: 1 });
    expect(history.undo({ value: 1 })).toBeNull();
  });

  it('does not coalesce a new edit into history created by redo', () => {
    const history = new HistoryController<State>(120, 750, cloneState);

    history.record({ value: 0 }, 'drag', 'clip:1:transform');
    expect(history.undo({ value: 1 })?.value).toEqual({ value: 0 });
    expect(history.redo({ value: 0 })?.value).toEqual({ value: 1 });

    history.record({ value: 1 }, 'drag', 'clip:1:transform');
    expect(history.undo({ value: 2 })?.value).toEqual({ value: 1 });
    expect(history.undo({ value: 1 })?.value).toEqual({ value: 0 });
  });

  it('keeps 100 sequential undo and redo operations reversible', () => {
    const history = new HistoryController<State>(120, 0, cloneState);
    let current: State = { value: 0 };

    for (let value = 1; value <= 100; value += 1) {
      history.record(current, `edit ${value}`);
      current = { value };
    }

    for (let value = 99; value >= 0; value -= 1) {
      const result = history.undo(current);
      expect(result?.value).toEqual({ value });
      current = result!.value;
    }
    expect(history.canUndo).toBe(false);
    expect(history.canRedo).toBe(true);

    for (let value = 1; value <= 100; value += 1) {
      const result = history.redo(current);
      expect(result?.value).toEqual({ value });
      current = result!.value;
    }
    expect(current).toEqual({ value: 100 });
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
  });

});
