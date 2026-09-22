import type { Project, ProjectExportSettings } from '../types/editor';
import { uid } from './project';
import { canonicalProjectFrameRate } from './timebase';
import { normalizeProjectTimecodeMode } from './timecode';

export interface ProjectSettingsTemplate {
  id: string;
  name: string;
  createdAt: string;
  width: number;
  height: number;
  fps: number;
  timecodeMode?: Project['timecodeMode'];
  background: string;
  exportSettings?: ProjectExportSettings;
}

const STORAGE_KEY = 'suiram-video-edit:project-settings-templates:v1';
const MAX_TEMPLATES = 32;

export function createProjectSettingsTemplate(
  name: string,
  project: Pick<Project, 'width' | 'height' | 'fps' | 'timecodeMode' | 'background' | 'exportSettings'>,
  now = new Date(),
): ProjectSettingsTemplate {
  const safeName = normalizeProjectTemplateName(name);
  if (!safeName) throw new Error('Template name is required');
  return {
    id: uid('project_template'),
    name: safeName,
    createdAt: now.toISOString(),
    width: clampInt(project.width, 16, 16384),
    height: clampInt(project.height, 16, 16384),
    fps: canonicalProjectFrameRate(project.fps),
    timecodeMode: project.timecodeMode ?? 'non-drop-frame',
    background: normalizeColor(project.background),
    exportSettings: cloneExportSettings(project.exportSettings),
  };
}

export function projectSettingsPatch(template: ProjectSettingsTemplate): Partial<Project> {
  return {
    width: template.width,
    height: template.height,
    fps: template.fps,
    timecodeMode: template.timecodeMode ?? 'non-drop-frame',
    background: template.background,
    exportSettings: cloneExportSettings(template.exportSettings),
  };
}

export function parseProjectSettingsTemplates(raw: string | null): ProjectSettingsTemplate[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map(parseTemplate)
      .filter((item): item is ProjectSettingsTemplate => Boolean(item))
      .slice(0, MAX_TEMPLATES);
  } catch {
    return [];
  }
}

export function loadProjectSettingsTemplates(storage: Pick<Storage, 'getItem'> | null = browserStorage()) {
  if (!storage) return [];
  try {
    return parseProjectSettingsTemplates(storage.getItem(STORAGE_KEY));
  } catch {
    return [];
  }
}

export function saveProjectSettingsTemplates(
  templates: ProjectSettingsTemplate[],
  storage: Pick<Storage, 'setItem'> | null = browserStorage(),
) {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(templates.slice(0, MAX_TEMPLATES)));
    return true;
  } catch {
    return false;
  }
}

export function normalizeProjectTemplateName(value: string) {
  return value.trim().replace(/\s+/g, ' ').slice(0, 80);
}

function parseTemplate(value: unknown): ProjectSettingsTemplate | null {
  if (!isRecord(value)) return null;
  const name = normalizeProjectTemplateName(typeof value.name === 'string' ? value.name : '');
  if (!name || typeof value.id !== 'string') return null;
  const fps = canonicalProjectFrameRate(clampNumber(value.fps, 1, 240));
  return {
    id: value.id.slice(0, 160),
    name,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : '',
    width: clampInt(value.width, 16, 16384),
    height: clampInt(value.height, 16, 16384),
    fps,
    timecodeMode: normalizeProjectTimecodeMode(value.timecodeMode, fps),
    background: normalizeColor(value.background),
    exportSettings: parseExportSettings(value.exportSettings),
  };
}

function parseExportSettings(value: unknown): ProjectExportSettings | undefined {
  if (!isRecord(value)) return undefined;
  const container = value.container === 'auto' || value.container === 'mp4' || value.container === 'webm' ? value.container : undefined;
  const quality = value.quality === 'compact' || value.quality === 'balanced' || value.quality === 'high' ? value.quality : undefined;
  const outputHeight = typeof value.outputHeight === 'number' && Number.isFinite(value.outputHeight)
    ? clampInt(value.outputHeight, 144, 4320)
    : undefined;
  const includeAudio = typeof value.includeAudio === 'boolean' ? value.includeAudio : undefined;
  if (container === undefined && quality === undefined && outputHeight === undefined && includeAudio === undefined) return undefined;
  return { container, quality, outputHeight, includeAudio };
}

function cloneExportSettings(value: ProjectExportSettings | undefined) {
  return value ? { ...value } : undefined;
}

function normalizeColor(value: unknown) {
  return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
}

function clampInt(value: unknown, min: number, max: number) {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : min;
  return Math.max(min, Math.min(max, numeric));
}

function clampNumber(value: unknown, min: number, max: number) {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, numeric));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
