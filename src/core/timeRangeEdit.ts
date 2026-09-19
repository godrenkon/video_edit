import type {
  Project,
  TimelineMarker,
  TranscriptDocument,
  TranscriptSegment,
  TranscriptWord,
} from '../types/editor';
import { quantizeToFrame, splitClipAt, trimClipLeft, trimClipRight } from './timelineOps';

export interface TimelineTimeRange {
  start: number;
  end: number;
}

export interface RippleDeleteTimeRangesOptions {
  requireUnlockedTracks?: boolean;
}

export interface RippleDeleteTimeRangesResult {
  project: Project;
  removedRanges: TimelineTimeRange[];
  removedSeconds: number;
  blockedTrackIds: string[];
}

export function normalizeTimeRanges(
  ranges: TimelineTimeRange[],
  fps: number,
  maxTime = Number.POSITIVE_INFINITY,
): TimelineTimeRange[] {
  const safeFps = Math.max(1, Number.isFinite(fps) ? fps : 30);
  const frame = 1 / safeFps;
  const epsilon = frame / 1000;
  const limit = Number.isFinite(maxTime) ? Math.max(0, maxTime) : Number.POSITIVE_INFINITY;

  const normalized = ranges
    .flatMap((range) => {
      if (!Number.isFinite(range.start) || !Number.isFinite(range.end)) return [];
      const rawStart = Math.min(range.start, range.end);
      const rawEnd = Math.max(range.start, range.end);
      const start = quantizeToFrame(Math.min(limit, Math.max(0, rawStart)), safeFps);
      const end = quantizeToFrame(Math.min(limit, Math.max(0, rawEnd)), safeFps);
      if (end - start < frame - epsilon) return [];
      return [{ start, end }];
    })
    .sort((a, b) => a.start - b.start || a.end - b.end);

  const merged: TimelineTimeRange[] = [];
  for (const range of normalized) {
    const previous = merged[merged.length - 1];
    if (!previous || range.start > previous.end + epsilon) {
      merged.push({ ...range });
      continue;
    }
    previous.end = Math.max(previous.end, range.end);
  }
  return merged;
}

export function rippleDeleteTimeRanges(
  project: Project,
  ranges: TimelineTimeRange[],
  options: RippleDeleteTimeRangesOptions = {},
): RippleDeleteTimeRangesResult {
  const normalized = normalizeTimeRanges(ranges, project.fps, project.duration);
  if (!normalized.length) {
    return { project, removedRanges: [], removedSeconds: 0, blockedTrackIds: [] };
  }

  const requireUnlockedTracks = options.requireUnlockedTracks !== false;
  const blockedTrackIds = requireUnlockedTracks
    ? findBlockingLockedTracks(project, normalized)
    : [];
  if (blockedTrackIds.length) {
    return { project, removedRanges: [], removedSeconds: 0, blockedTrackIds };
  }

  let next = project;
  for (const range of [...normalized].reverse()) {
    next = applySingleTimeRangeCut(next, range);
  }

  return {
    project: next,
    removedRanges: normalized,
    removedSeconds: normalized.reduce((sum, range) => sum + range.end - range.start, 0),
    blockedTrackIds: [],
  };
}

function applySingleTimeRangeCut(project: Project, range: TimelineTimeRange): Project {
  const frame = 1 / Math.max(1, project.fps || 30);
  const epsilon = frame / 1000;
  const duration = range.end - range.start;
  if (duration < frame - epsilon) return project;

  let next = splitUnlockedClipsAt(project, range.end);
  next = splitUnlockedClipsAt(next, range.start);
  next = trimResidualBoundaryOverlaps(next, range.start, range.end);

  const tracks = next.tracks.map((track) => {
    if (track.locked) return track;
    const clips = track.clips.flatMap((clip) => {
      const clipEnd = clip.start + clip.duration;

      if (clip.start >= range.start - epsilon && clipEnd <= range.end + epsilon) {
        return [];
      }

      if (
        clip.start < range.start
        && clipEnd > range.end
        && range.start - clip.start < frame + epsilon
        && clipEnd - range.end < frame + epsilon
      ) {
        return [];
      }

      if (clip.start >= range.end - epsilon) {
        return [{ ...clip, start: quantizeToFrame(Math.max(0, clip.start - duration), project.fps) }];
      }

      return [clip];
    });
    return { ...track, clips };
  });

  const markers = cutMarkers(next.markers, range.start, range.end);
  const transcript = cutTranscript(next.transcript, range.start, range.end);
  const mappedInPoint = mapOptionalPoint(next.inPoint, range.start, range.end);
  const mappedOutPoint = mapOptionalPoint(next.outPoint, range.start, range.end);
  const inPoint = mappedInPoint;
  const outPoint = mappedInPoint !== undefined && mappedOutPoint !== undefined
    ? Math.max(mappedInPoint, mappedOutPoint)
    : mappedOutPoint;

  return {
    ...next,
    tracks,
    markers,
    transcript,
    inPoint,
    outPoint,
    duration: Math.max(0, next.duration - duration),
  };
}

function splitUnlockedClipsAt(project: Project, boundary: number) {
  const frame = 1 / Math.max(1, project.fps || 30);
  const epsilon = frame / 1000;
  const targets = project.tracks.flatMap((track) => {
    if (track.locked) return [];
    return track.clips
      .filter((clip) => (
        boundary >= clip.start + frame - epsilon
        && boundary <= clip.start + clip.duration - frame + epsilon
      ))
      .map((clip) => clip.id);
  });

  let next = project;
  for (const clipId of targets) next = splitClipAt(next, clipId, boundary);
  return next;
}

function trimResidualBoundaryOverlaps(project: Project, start: number, end: number) {
  const epsilon = 1 / Math.max(1, project.fps || 30) / 1000;
  let next = project;

  const leftOverlapIds = next.tracks.flatMap((track) => {
    if (track.locked) return [];
    return track.clips
      .filter((clip) => (
        clip.start < start - epsilon
        && clip.start + clip.duration > start + epsilon
        && clip.start + clip.duration <= end + epsilon
      ))
      .map((clip) => clip.id);
  });
  for (const clipId of leftOverlapIds) {
    next = trimClipRight(next, clipId, start, undefined, 0);
  }

  const rightOverlapIds = next.tracks.flatMap((track) => {
    if (track.locked) return [];
    return track.clips
      .filter((clip) => (
        clip.start >= start - epsilon
        && clip.start < end - epsilon
        && clip.start + clip.duration > end + epsilon
      ))
      .map((clip) => clip.id);
  });
  for (const clipId of rightOverlapIds) {
    next = trimClipLeft(next, clipId, end, undefined, 0);
  }

  return next;
}

function findBlockingLockedTracks(project: Project, ranges: TimelineTimeRange[]) {
  const epsilon = 1 / Math.max(1, project.fps || 30) / 1000;
  return project.tracks
    .filter((track) => (
      track.locked
      && track.clips.some((clip) => ranges.some((range) => clip.start + clip.duration > range.start + epsilon))
    ))
    .map((track) => track.id);
}

function cutMarkers(
  markers: TimelineMarker[] | undefined,
  start: number,
  end: number,
): TimelineMarker[] | undefined {
  if (!markers) return undefined;
  const duration = end - start;
  const epsilon = 1e-9;
  const output: TimelineMarker[] = [];

  for (const marker of markers) {
    const markerDuration = Math.max(0, marker.duration ?? 0);
    if (markerDuration <= epsilon) {
      if (marker.time >= start - epsilon && marker.time < end - epsilon) continue;
      output.push({
        ...marker,
        time: marker.time >= end - epsilon ? Math.max(0, marker.time - duration) : marker.time,
      });
      continue;
    }

    const mappedStart = mapPoint(marker.time, start, end);
    const mappedEnd = mapPoint(marker.time + markerDuration, start, end);
    if (mappedEnd - mappedStart <= epsilon) continue;
    output.push({
      ...marker,
      time: mappedStart,
      duration: mappedEnd - mappedStart,
    });
  }

  return output.sort((a, b) => a.time - b.time || a.name.localeCompare(b.name, 'ja'));
}

function cutTranscript(
  transcript: TranscriptDocument | undefined,
  start: number,
  end: number,
): TranscriptDocument | undefined {
  if (!transcript) return undefined;
  const epsilon = 1e-9;
  const segments: TranscriptSegment[] = [];

  for (const segment of transcript.segments) {
    const mappedStart = mapPoint(segment.start, start, end);
    const mappedEnd = mapPoint(segment.end, start, end);
    if (mappedEnd - mappedStart <= epsilon) continue;

    const words = segment.words
      ?.map((word) => cutTranscriptWord(word, start, end))
      .filter((word): word is TranscriptWord => Boolean(word));

    const intersectsCut = segment.start < end - epsilon && segment.end > start + epsilon;
    segments.push({
      ...segment,
      start: mappedStart,
      end: mappedEnd,
      sourceClipId: intersectsCut ? undefined : segment.sourceClipId,
      words: words?.length ? words : undefined,
    });
  }

  return {
    ...transcript,
    updatedAt: new Date().toISOString(),
    segments,
  };
}

function cutTranscriptWord(word: TranscriptWord, start: number, end: number): TranscriptWord | null {
  const mappedStart = mapPoint(word.start, start, end);
  const mappedEnd = mapPoint(word.end, start, end);
  if (mappedEnd - mappedStart <= 1e-9) return null;
  return { ...word, start: mappedStart, end: mappedEnd };
}

function mapOptionalPoint(value: number | undefined, start: number, end: number) {
  if (value === undefined || !Number.isFinite(value)) return value;
  return mapPoint(value, start, end);
}

function mapPoint(value: number, start: number, end: number) {
  if (value <= start) return Math.max(0, value);
  if (value >= end) return Math.max(0, value - (end - start));
  return start;
}
