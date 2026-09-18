import type { Clip, Project } from '../types/editor';
import { findClip, quantizeToFrame } from './timelineOps';

export interface DuplicateClipResult {
  project: Project;
  clipId: string | null;
}

export function duplicateClipAfter(project: Project, clipId: string): DuplicateClipResult {
  const location = findClip(project, clipId);
  if (!location || location.track.locked) return { project, clipId: null };

  const copy = cloneClipWithFreshIds(location.clip);
  copy.start = quantizeToFrame(location.clip.start + location.clip.duration, project.fps);

  return {
    clipId: copy.id,
    project: {
      ...project,
      tracks: project.tracks.map((track, index) => index === location.trackIndex
        ? { ...track, clips: [...track.clips, copy] }
        : track),
    },
  };
}

export function cloneClipWithFreshIds(source: Clip): Clip {
  const copy = structuredClone(source);
  copy.id = freshId('clip');
  copy.effects = copy.effects?.map((effect) => ({
    ...effect,
    id: freshId('fx'),
    parameters: Object.fromEntries(Object.entries(effect.parameters).map(([key, parameter]) => [
      key,
      {
        ...parameter,
        value: cloneValue(parameter.value),
        keyframes: parameter.keyframes?.map((keyframe) => ({
          ...keyframe,
          id: freshId('kf'),
          value: cloneValue(keyframe.value),
          inTangent: keyframe.inTangent ? [...keyframe.inTangent] : undefined,
          outTangent: keyframe.outTangent ? [...keyframe.outTangent] : undefined,
        })),
      },
    ])),
  }));
  return copy;
}

function cloneValue<T>(value: T): T {
  return Array.isArray(value) ? [...value] as T : value;
}

function freshId(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}
