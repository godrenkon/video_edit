import { describe, expect, it } from 'vitest';
import type { Clip, Project, Track } from '../types/editor';
import { groupClipIds, groupSelectedClips, selectedHasGroup, ungroupSelectedClips } from './groupOps';

function clip(id: string): Clip {
  return {
    id, kind: 'asset', name: id, assetId: 'asset', start: 0, duration: 1, inPoint: 0,
    volume: 1, muted: false, transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
  };
}
function track(id: string, clips: Clip[], locked = false): Track {
  return { id, name: id, kind: 'video', muted: false, locked, visible: true, clips };
}
function project(tracks: Track[]): Project {
  return {
    version: 2, id: 'p', name: 'p', width: 1920, height: 1080, fps: 30, background: '#000',
    duration: 10, createdAt: '', updatedAt: '', assets: [], tracks, markers: [],
  };
}

describe('clip grouping', () => {
  it('assigns one fresh group id to two or more editable selected clips', () => {
    const output = groupSelectedClips(project([track('a', [clip('1'), clip('2'), clip('3')])]), ['1', '2']);
    const [a, b, c] = output.tracks[0].clips;
    expect(a.groupId).toBeTruthy();
    expect(b.groupId).toBe(a.groupId);
    expect(c.groupId).toBeUndefined();
  });

  it('does not group fewer than two clips or modify locked tracks', () => {
    const input = project([track('locked', [clip('1'), clip('2')], true)]);
    expect(groupSelectedClips(input, ['1', '2'])).toBe(input);
    expect(groupSelectedClips(project([track('a', [clip('1')])]), ['1']).tracks[0].clips[0].groupId).toBeUndefined();
  });

  it('merges whole existing groups instead of leaving split group identities behind', () => {
    const input = project([track('a', [
      { ...clip('1'), groupId: 'g1' },
      { ...clip('2'), groupId: 'g1' },
      { ...clip('3'), groupId: 'g2' },
      { ...clip('4'), groupId: 'g2' },
    ])]);
    const output = groupSelectedClips(input, ['1', '3']);
    const ids = new Set(output.tracks[0].clips.map((item) => item.groupId));
    expect(ids.size).toBe(1);
    expect([...ids][0]).toBeTruthy();
  });

  it('expands normal selection to every editable member of the same group', () => {
    const a = { ...clip('1'), groupId: 'g' };
    const b = { ...clip('2'), groupId: 'g' };
    const c = { ...clip('3'), groupId: 'other' };
    expect(groupClipIds(project([track('a', [a, b, c])]), '1')).toEqual(['1', '2']);
  });

  it('ungroups every member when any selected member belongs to a group', () => {
    const input = project([track('a', [{ ...clip('1'), groupId: 'g' }, { ...clip('2'), groupId: 'g' }])]);
    expect(selectedHasGroup(input, ['1'])).toBe(true);
    const output = ungroupSelectedClips(input, ['1']);
    expect(output.tracks[0].clips.every((item) => item.groupId === undefined)).toBe(true);
  });
});
