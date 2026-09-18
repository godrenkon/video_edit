import { cloneEffectValue, evaluateEffectParameter, sortedValidKeyframes } from './keyframes';
import type { Clip, EffectInstance, EffectParameter, Project, Track } from '../types/editor';
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
  const source = location.clip;
  const left = sliceClipLocalData(source, 0, localTime);
  const right = sliceClipLocalData(source, localTime, source.duration);

  left.duration = localTime;
  left.transitionOut = undefined;
  right.transitionIn = undefined;
  right.id = uid('clip');
  right.name = `${source.name} (2)`;
  right.start = splitTime;
  right.duration = clipEnd - splitTime;

  if (source.reverse) {
    left.inPoint = source.inPoint + (source.duration - localTime) * speed;
    right.inPoint = source.inPoint;
  } else {
    left.inPoint = source.inPoint;
    right.inPoint = source.inPoint + localTime * speed;
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

export function trimClipLeft(project: Project, clipId: string, requestedStart: number, playhead?: number, thresholdSeconds = 0.12) {
  const location = findClip(project, clipId);
  if (!location || location.track.locked) return project;

  const source = location.clip;
  const frame = 1 / Math.max(1, project.fps);
  const end = source.start + source.duration;
  const speed = Math.max(0.0001, source.speed ?? 1);
  const assetDuration = sourceAssetDuration(project, source);
  let maxDuration = end;

  if (assetDuration !== null) {
    if (source.reverse) maxDuration = Math.max(frame, (assetDuration - source.inPoint) / speed);
    else maxDuration = Math.max(frame, (source.inPoint + source.duration * speed) / speed);
  }

  const minimumStart = Math.max(0, end - maxDuration);
  const snapped = snapTime(project, requestedStart, clipId, playhead, thresholdSeconds);
  const start = Math.min(end - frame, Math.max(minimumStart, snapped));
  const delta = start - source.start;
  const duration = end - start;
  if (Math.abs(delta) < frame / 1000) return project;

  const replacement = delta >= 0
    ? sliceClipLocalData(source, delta, source.duration)
    : extendClipLeftLocalData(source, -delta);
  replacement.start = start;
  replacement.duration = duration;
  replacement.inPoint = source.reverse
    ? source.inPoint
    : Math.max(0, source.inPoint + delta * speed);

  return replaceClip(project, clipId, replacement);
}

export function trimClipRight(project: Project, clipId: string, requestedEnd: number, playhead?: number, thresholdSeconds = 0.12) {
  const location = findClip(project, clipId);
  if (!location || location.track.locked) return project;

  const source = location.clip;
  const frame = 1 / Math.max(1, project.fps);
  const speed = Math.max(0.0001, source.speed ?? 1);
  const assetDuration = sourceAssetDuration(project, source);
  const snappedEnd = snapTime(project, requestedEnd, clipId, playhead, thresholdSeconds);
  let duration = Math.max(frame, snappedEnd - source.start);

  if (assetDuration !== null) {
    const maxDuration = source.reverse
      ? (source.inPoint + source.duration * speed) / speed
      : Math.max(0, assetDuration - source.inPoint) / speed;
    duration = Math.min(duration, Math.max(frame, maxDuration));
  }

  const replacement = duration < source.duration
    ? sliceClipLocalData(source, 0, duration)
    : structuredClone(source);
  replacement.duration = duration;
  if (source.reverse) {
    const sourceAtTimelineStart = source.inPoint + source.duration * speed;
    replacement.inPoint = Math.max(0, sourceAtTimelineStart - duration * speed);
  }

  return replaceClip(project, clipId, replacement);
}

export function slipClipSource(project: Project, clipId: string, requestedInPoint: number): Project {
  const location = findClip(project, clipId);
  if (!location || location.track.locked) return project;
  const source = location.clip;
  const assetDuration = sourceAssetDuration(project, source);
  const speed = Math.max(0.0001, source.speed ?? 1);
  const span = source.duration * speed;
  const maxInPoint = assetDuration === null ? Number.MAX_SAFE_INTEGER : Math.max(0, assetDuration - span);
  const inPoint = quantizeSource(Math.max(0, Math.min(maxInPoint, requestedInPoint)), project.fps, speed);
  const delta = inPoint - source.inPoint;
  const freezeFrameAt = typeof source.freezeFrameAt === 'number' && Number.isFinite(source.freezeFrameAt)
    ? Math.max(0, assetDuration === null ? source.freezeFrameAt + delta : Math.min(assetDuration, source.freezeFrameAt + delta))
    : source.freezeFrameAt;
  return replaceClip(project, clipId, { ...source, inPoint, freezeFrameAt });
}

export function moveClip(project: Project, clipId: string, requestedStart: number, playhead?: number, thresholdSeconds = 0.12) {
  const location = findClip(project, clipId);
  if (!location || location.track.locked) return project;
  const start = snapTime(project, requestedStart, clipId, playhead, thresholdSeconds);
  return replaceClip(project, clipId, { ...location.clip, start });
}

function sourceAssetDuration(project: Project, clip: Clip) {
  if (!clip.assetId) return null;
  const asset = project.assets.find((item) => item.id === clip.assetId);
  if (!asset || asset.kind === 'image' || !Number.isFinite(asset.duration) || asset.duration <= 0) return null;
  return asset.duration;
}

function quantizeSource(sourceTime: number, fps: number, speed: number) {
  const sourcePerFrame = Math.max(0.000001, speed) / Math.max(1, fps);
  return Math.max(0, Math.round(sourceTime / sourcePerFrame) * sourcePerFrame);
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

function sliceClipLocalData(source: Clip, from: number, to: number): Clip {
  const clone = structuredClone(source);
  const start = Math.max(0, from);
  const end = Math.max(start, Math.min(source.duration, to));
  clone.effects = sliceEffects(source.effects, start, end);

  if (clone.zundamon) {
    clone.zundamon.cues = source.zundamon?.cues
      .filter((cue) => cue.time >= start && cue.time <= end)
      .map((cue) => ({ ...cue, time: cue.time - start })) ?? [];
  }

  if (clone.subtitle?.words) {
    clone.subtitle.words = source.subtitle?.words
      ?.filter((word) => word.end > start && word.start < end)
      .map((word) => ({
        ...word,
        start: Math.max(0, word.start - start),
        end: Math.min(end - start, Math.max(0, word.end - start)),
      })) ?? [];
  }

  return clone;
}

function extendClipLeftLocalData(source: Clip, extension: number): Clip {
  const clone = structuredClone(source);
  if (extension <= 0) return clone;

  clone.effects = shiftEffects(source.effects, extension);
  if (clone.zundamon) {
    clone.zundamon.cues = clone.zundamon.cues.map((cue) => ({ ...cue, time: cue.time + extension }));
  }
  if (clone.subtitle?.words) {
    clone.subtitle.words = clone.subtitle.words.map((word) => ({
      ...word,
      start: word.start + extension,
      end: word.end + extension,
    }));
  }
  return clone;
}

function sliceEffects(effects: EffectInstance[] | undefined, from: number, to: number) {
  if (!effects) return effects;
  return effects.map((effect) => ({
    ...effect,
    parameters: Object.fromEntries(
      Object.entries(effect.parameters).map(([key, parameter]) => [key, sliceEffectParameter(parameter, from, to)]),
    ),
  }));
}

function shiftEffects(effects: EffectInstance[] | undefined, offset: number) {
  if (!effects) return effects;
  return effects.map((effect) => ({
    ...effect,
    parameters: Object.fromEntries(
      Object.entries(effect.parameters).map(([key, parameter]) => [
        key,
        {
          ...parameter,
          keyframes: parameter.keyframes?.map((keyframe) => ({ ...keyframe, time: keyframe.time + offset })),
        },
      ]),
    ),
  }));
}

function sliceEffectParameter(parameter: EffectParameter, from: number, to: number): EffectParameter {
  const keyframes = sortedValidKeyframes(parameter.keyframes);
  if (keyframes.length === 0) return { ...parameter, keyframes: undefined };

  const duration = Math.max(0, to - from);
  const result = keyframes
    .filter((keyframe) => keyframe.time >= from && keyframe.time <= to)
    .map((keyframe) => ({ ...keyframe, value: cloneEffectValue(keyframe.value), time: keyframe.time - from }));

  if (!result.some((keyframe) => Math.abs(keyframe.time) <= 1e-9)) {
    result.unshift({
      id: uid('kf'),
      time: 0,
      value: evaluateEffectParameter(parameter, from),
      interpolation: interpolationAt(parameter, from),
    });
  }

  if (duration > 0 && !result.some((keyframe) => Math.abs(keyframe.time - duration) <= 1e-9)) {
    result.push({
      id: uid('kf'),
      time: duration,
      value: evaluateEffectParameter(parameter, to),
      interpolation: 'linear',
    });
  }

  return { ...parameter, keyframes: result };
}

function interpolationAt(parameter: EffectParameter, time: number) {
  const keyframes = sortedValidKeyframes(parameter.keyframes);
  if (keyframes.length === 0) return 'linear' as const;
  let candidate = keyframes[0];
  for (const keyframe of keyframes) {
    if (keyframe.time > time) break;
    candidate = keyframe;
  }
  return candidate.interpolation;
}
