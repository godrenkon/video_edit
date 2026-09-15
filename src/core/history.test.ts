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
});
