import { describe, expect, it } from 'vitest';
import { collectMediaFilesFromDirectory } from './folderImport';

type FakeEntry = FakeDirectory | FakeFile;
interface FakeDirectory {
  kind: 'directory';
  name: string;
  values(): AsyncIterableIterator<FakeEntry>;
}
interface FakeFile {
  kind: 'file';
  name: string;
  getFile(): Promise<File>;
}

function file(name: string, type: string): FakeFile {
  return {
    kind: 'file',
    name,
    getFile: async () => new File(['x'], name, { type }),
  };
}

function directory(name: string, entries: FakeEntry[]): FakeDirectory {
  return {
    kind: 'directory',
    name,
    async *values() {
      for (const entry of entries) yield entry;
    },
  };
}

describe('folder import', () => {
  it('recursively collects only supported media and sorts by path', async () => {
    const root = directory('root', [
      file('z.txt', 'text/plain'),
      directory('B', [file('voice.wav', 'audio/wav')]),
      directory('A', [file('shot.mp4', 'video/mp4'), file('still.png', 'image/png')]),
    ]);
    const result = await collectMediaFilesFromDirectory(root as unknown as FileSystemDirectoryHandle, 20);
    expect(result.files.map((item) => item.name)).toEqual(['shot.mp4', 'still.png', 'voice.wav']);
    expect(result.truncated).toBe(false);
  });

  it('stops at a bounded media-file limit', async () => {
    const root = directory('root', [
      file('a.mp4', 'video/mp4'),
      file('b.mp4', 'video/mp4'),
      file('c.mp4', 'video/mp4'),
    ]);
    const result = await collectMediaFilesFromDirectory(root as unknown as FileSystemDirectoryHandle, 2);
    expect(result.files).toHaveLength(2);
    expect(result.truncated).toBe(true);
  });
});
