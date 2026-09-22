import { expect, it } from 'vitest';
import {
  beginEditorSession,
  markEditorSessionClean,
  markEditorSessionDirty,
} from './session';

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

it('keeps a session open after a new edit until the save is confirmed', () => {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: storage,
  });

  expect(beginEditorSession()).toBe(false);
  expect(JSON.parse(storage.getItem('suiram-video-edit.session-state')!)).toMatchObject({
    status: 'open',
  });

  markEditorSessionClean();
  const clean = JSON.parse(storage.getItem('suiram-video-edit.session-state')!);
  expect(clean.status).toBe('clean');

  markEditorSessionDirty();
  const dirty = JSON.parse(storage.getItem('suiram-video-edit.session-state')!);
  expect(dirty.status).toBe('open');
  expect(dirty.startedAt).toBe(clean.startedAt);
});
