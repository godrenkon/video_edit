import type { Clip, EffectInstance, Project, Track } from '../types/editor';
import { uid } from './project';

export interface ClipLocation {
  track: Track;
  trackIndex: number;
  clip: Clip;
  clipIndex: number;
}

export function findClip(project: Project, clipId: string): ClipLocation | null {
  for (let trackIndex = 0; trackIndex < project.tracks.length; trackIndex += 1) {
    const track = project.tracks[trackIndex];
    const clipIndex = track.clips.findIndex((clip) => clip.id === clipId);
    if (clipIndex >= 0) {
      return { track, trackIndex, clip: track.clips[clipIndex], clipIndex };
    }
  }
  return null;
}

export function quantizeToFrame(time: number, fps: number) {
  const safeFps = Math.max(1, fps || 30);
  return Math.max(0, Math.round(time * safeFps) / safeFps);
}

export function snapTime(
  project: Project,
  rawTime: number,
  movingClipId?: string,
  playhead?: number,
  thresholdSeconds = 0.12,
) {
  const frameTime = quantizeToFrame(rawTime, project.fps);
  const candidates = new Set<number>([0]);

  if (typeof playhead === 'number') candidates.add(quantizeToFrame(playhead, project.fps));
  for (const marker of project.markers ?? []) {
    candidates.add(quantizeToFrame(marker.time, project.fps));
    if (marker.duration) candidates.add(quantizeToFrame(marker.time + marker.duration, project.fps));
  }
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      if (clip.id === movingClipId) continue;
      candidates.add(quantizeToFrame(clip.start, project.fps));
      candidates.add(quantizeToFrame(clip.start + clip.duration, project.fps));
    }
  }

  let best = frameTime;
  let bestDistance = thresholdSeconds + Number.EPSILON;
  for (const candidate of candidates) {
    const distance = Math.abs(candidate - frameTime);
    if (distance <= thresholdSeconds && distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return Math.max(0, best);
}

export function splitClipAt(project: Project, clipId: string, absoluteTime: number): Project {
  const location = findClip(project, clipId);
  if (!location || location.track.locked) return project;

  const splitTime = quantizeToFrame(absoluteTime, project.fps);
  const frame = 1 / Math.max(1, project.fps);
  const clipEnd = location.clip.start + location.clip.duration;
  if (splitTime < location.clip.start + frame || splitTime > clipEnd - frame) return project;

  const localTime = splitTime - location.clip.start;
  const speed = Math.max(0.0001, location.clip.speed ?? 1);
  const left = structuredClone(location.clip);
  const right = structuredClone(location.clip);

  left.duration = localTime;
  left.effects = splitEffects(location.clip.effects, 0, localTime, false);
  if (left.zundamon) {
    left.zundamon.cues = left.zundamon.cues.filter((cue) => cue.time < localTime);
  }
  if (left.subtitle?.words) {
    left.subtitle.words = left.subtitle.words.filter((word) => word.start < localTime);
  }

  right.id = uid('clip');
  right.name = `${location.clip.name} (2)`;
  right.start = splitTime;
  right.duration = clipEnd - splitTime;
  right.inPoint = location.clip.inPoint + localTime * speed;
  right.effects = splitEffects(location.clip.effects, localTime, location.clip.duration, true);
  if (right.zundamon) {
    right.zundamon.cues = right.zundamon.cues
      .filter((cue) => cue.time >= localTime)
      .map((cue) => ({ ...cue, time: cue.time - localTime }));
  }
  if (right.subtitle?.words) {
    right.subtitle.words = right.subtitle.words
      .filter((word) => word.end > localTime)
      .map((word) => ({
        ...word,
        start: Math.max(0, word.start - localTime),
        end: Math.max(0, word.end - localTime),
      }));
  }

  return {
    ...project,
    tracks: project.tracks.map((track, index) => {
      if (index !== location.trackIndex) return track;
      const clips = [...track.clips];
      clips.splice(location.clipIndex, 1, left, right);
      return { ...track, clips };
    }),
  };
}

export function rippleDeleteClip(project: Project, clipId: string, allUnlockedTracks = false): Project {
  const location = findClip(project, clipId);
  if (!location || location.track.locked) return project;

  const gapStart = location.clip.start;
  const gapEnd = location.clip.start + location.clip.duration;
  const gapDuration = location.clip.duration;

  return {
    ...project,
    tracks: project.tracks.map((track, index) => {
      const shouldRipple = allUnlockedTracks ? !track.locked : index === location.trackIndex;
      if (!shouldRipple) return track;

      const clips = track.clips
        .filter((clip) => clip.id !== clipId)
        .map((clip) => {
          if (clip.start >= gapEnd) return { ...clip, start: Math.max(gapStart, clip.start - gapDuration) };
          return clip;
        });
      return { ...track, clips };
    }),
  };
}

export function nudgeClip(project: Project, clipId: string, frames: number): Project {
  const location = findClip(project, clipId);
  if (!location || location.track.locked || frames === 0) return project;
  const delta = frames / Math.max(1, project.fps);
  const nextStart = quantizeToFrame(Math.max(0, location.clip.start + delta), project.fps);
  return replaceClip(project, clipId, { ...location.clip, start: nextStart });
}

export function duplicateClip(project: Project, clipId: string): { project: Project; newClipId: string | null } {
  const location = findClip(project, clipId);
  if (!location || location.track.locked) return { project, newClipId: null };

  const copy = structuredClone(location.clip);
  copy.id = uid('clip');
  copy.name = `${location.clip.name} コピー`;
  copy.start = quantizeToFrame(location.clip.start + location.clip.duration, project.fps);

  const tracks = project.tracks.map((track, index) => index === location.trackIndex
    ? { ...track, clips: [...track.clips, copy] }
    : track);
  return { project: { ...project, tracks }, newClipId: copy.id };
}

export function trimClipRight(project: Project, clipId: string, requestedEnd: number, playhead?: number, thresholdSeconds = 0.12) {
  const location = findClip(project, clipId);
  if (!location || location.track.locked) return project;
  const end = snapTime(project, requestedEnd, clipId, playhead, thresholdSeconds);
  const minDuration = 1 / Math.max(1, project.fps);
  const duration = Math.max(minDuration, end - location.clip.start);
  return replaceClip(project, clipId, { ...location.clip, duration });
}

export function moveClip(project: Project, clipId: string, requestedStart: number, playhead?: number, thresholdSeconds = 0.12) {
  const location = findClip(project, clipId);
  if (!location || location.track.locked) return project;
  const start = snapTime(project, requestedStart, clipId, playhead, thresholdSeconds);
  return replaceClip(project, clipId, { ...location.clip, start });
}

function replaceClip(project: Project, clipId: string, replacement: Clip): Project {
  return {
    ...project,
    tracks: project.tracks.map((track) => ({
      ...track,
      clips: track.clips.map((clip) => clip.id === clipId ? replacement : clip),
    })),
  };
}

function splitEffects(effects: EffectInstance[] | undefined, from: number, to: number, shift: boolean) {
  if (!effects) return effects;
  return effects.map((effect) => ({
    ...effect,
    parameters: Object.fromEntries(
      Object.entries(effect.parameters).map(([key, parameter]) => [
        key,
        {
          ...parameter,
          keyframes: parameter.keyframes
            ?.filter((keyframe) => keyframe.time >= from && keyframe.time <= to)
            .map((keyframe) => shift ? { ...keyframe, time: keyframe.time - from } : keyframe),
        },
      ]),
    ),
  }));
}
