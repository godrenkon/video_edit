import { describe, expect, it } from 'vitest';
import type { Project } from '../types/editor';
import {
  createProjectSettingsTemplate,
  loadProjectSettingsTemplates,
  normalizeProjectTemplateName,
  parseProjectSettingsTemplates,
  projectSettingsPatch,
  saveProjectSettingsTemplates,
} from './projectTemplates';

const baseProject = (): Project => ({
  version: 2,
  id: 'p',
  name: 'Project',
  width: 1920,
  height: 1080,
  fps: 60,
  background: '#112233',
  duration: 10,
  createdAt: '',
  updatedAt: '',
  assets: [{ id: 'asset', name: 'keep', kind: 'image', mime: 'image/png', size: 1, duration: 0, storageName: 'a.png' }],
  tracks: [{ id: 'track', name: 'keep', kind: 'video', muted: false, locked: false, visible: true, clips: [] }],
  exportSettings: { container: 'mp4', outputHeight: 1080, quality: 'high', includeAudio: true },
});

describe('project settings templates', () => {
  it('captures only safe project settings', () => {
    const project = baseProject();
    const template = createProjectSettingsTemplate('  YouTube   1080p ', project, new Date('2026-01-01T00:00:00.000Z'));
    expect(template).toMatchObject({
      name: 'YouTube 1080p',
      width: 1920,
      height: 1080,
      fps: 60,
      background: '#112233',
      exportSettings: { container: 'mp4', outputHeight: 1080, quality: 'high', includeAudio: true },
    });
  });

  it('returns a patch that cannot replace assets or tracks', () => {
    const project = baseProject();
    const template = createProjectSettingsTemplate('Preset', project);
    const patch = projectSettingsPatch(template);
    expect(patch).not.toHaveProperty('assets');
    expect(patch).not.toHaveProperty('tracks');
    expect({ ...project, ...patch }.assets).toBe(project.assets);
    expect({ ...project, ...patch }.tracks).toBe(project.tracks);
  });

  it('sanitizes persisted templates and malformed JSON', () => {
    const parsed = parseProjectSettingsTemplates(JSON.stringify([{
      id: 't',
      name: ' Test ',
      width: 999999,
      height: -1,
      fps: 999,
      background: 'invalid',
      exportSettings: { container: 'avi', outputHeight: 99999, quality: 'ultra', includeAudio: false },
    }]));
    expect(parsed[0]).toMatchObject({
      name: 'Test',
      width: 16384,
      height: 16,
      fps: 240,
      background: '#000000',
      exportSettings: { outputHeight: 4320, includeAudio: false },
    });
    expect(parseProjectSettingsTemplates('{broken')).toEqual([]);
  });

  it('round-trips through storage safely', () => {
    let raw = '';
    const writer = { setItem: (_key: string, value: string) => { raw = value; } };
    const reader = { getItem: () => raw };
    const template = createProjectSettingsTemplate('Saved', baseProject());
    expect(saveProjectSettingsTemplates([template], writer)).toBe(true);
    expect(loadProjectSettingsTemplates(reader)).toMatchObject([{ id: template.id, name: 'Saved' }]);
  });

  it('normalizes names to a single compact line', () => {
    expect(normalizeProjectTemplateName('  A\n B  ')).toBe('A B');
  });
});
