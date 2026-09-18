import type { Clip, MouthCue, Project, Track } from '../types/editor';
import { clipFadeGain } from './audioEnvelope';
import { resolveTrackBusMix } from './trackMix';

export interface ActiveTimelineItem {
  track: Track;
  trackIndex: number;
  clip: Clip;
  sourceTime: number;
}

export interface ZundamonVisualState {
  assetId: string | null;
  mouthState: 0 | 1 | 2;
  blinking: boolean;
  bobOffset: number;
}

export function isClipActive(clip: Clip, timeSeconds: number) {
  return timeSeconds >= clip.start && timeSeconds < clip.start + clip.duration;
}

export function clipLocalTime(clip: Clip, timeSeconds: number) {
  return Math.max(0, Math.min(clip.duration, timeSeconds - clip.start));
}

export function clipSourceTime(clip: Clip, timeSeconds: number) {
  if (typeof clip.freezeFrameAt === 'number' && Number.isFinite(clip.freezeFrameAt)) return Math.max(0, clip.freezeFrameAt);
  const local = clipLocalTime(clip, timeSeconds);
  const speed = Math.max(0.0001, clip.speed ?? 1);
  if (clip.reverse) {
    return Math.max(0, clip.inPoint + (clip.duration - local) * speed);
  }
  return Math.max(0, clip.inPoint + local * speed);
}

export function activeTimelineItems(project: Project, timeSeconds: number): ActiveTimelineItem[] {
  const result: ActiveTimelineItem[] = [];
  for (let trackIndex = 0; trackIndex < project.tracks.length; trackIndex += 1) {
    const track = project.tracks[trackIndex];
    for (const clip of track.clips) {
      if (!isClipActive(clip, timeSeconds)) continue;
      result.push({
        track,
        trackIndex,
        clip,
        sourceTime: clipSourceTime(clip, timeSeconds),
      });
    }
  }
  return result;
}

export function visualTimelineItems(project: Project, timeSeconds: number) {
  return activeTimelineItems(project, timeSeconds)
    .filter(({ track }) => track.kind !== 'audio' && track.visible !== false)
    .sort((a, b) => b.trackIndex - a.trackIndex);
}

/**
 * Returns timeline items that can contribute sound. Dedicated audio tracks are
 * always eligible, while video tracks contribute when their asset is a video
 * container (which may carry an embedded audio track). Preview volume includes
 * the same clip fade envelope used by the deterministic offline audio mixer.
 */
export function audioTimelineItems(project: Project, timeSeconds: number) {
  const assetKinds = new Map(project.assets.map((asset) => [asset.id, asset.kind]));
  const candidates = project.tracks.filter((track) => track.kind === 'audio' || track.kind === 'video');
  const hasSolo = candidates.some((track) => track.solo);

  return activeTimelineItems(project, timeSeconds)
    .filter(({ track, clip }) => {
      if (track.kind !== 'audio' && track.kind !== 'video') return false;
      const trackMix = resolveTrackBusMix(project, track);
      if (trackMix.muted || (hasSolo && !track.solo) || clip.muted || !clip.assetId) return false;
      if (track.kind === 'audio') return true;
      if (typeof clip.freezeFrameAt === 'number' && Number.isFinite(clip.freezeFrameAt)) return false;
      return assetKinds.get(clip.assetId) === 'video';
    })
    .map((item) => {
      const trackMix = resolveTrackBusMix(project, item.track);
      const fadeGain = clipFadeGain({
        duration: item.clip.duration,
        fadeIn: item.clip.fadeIn,
        fadeOut: item.clip.fadeOut,
      }, clipLocalTime(item.clip, timeSeconds));
      return {
        ...item,
        track: {
          ...item.track,
          gain: trackMix.gain,
          pan: trackMix.pan,
          muted: trackMix.muted,
        },
        clip: {
          ...item.clip,
          volume: Math.max(0, Math.min(1, item.clip.volume * fadeGain)),
        },
      };
    });
}

export function activeMouthCue(cues: MouthCue[], localSeconds: number): MouthCue | null {
  if (cues.length === 0 || localSeconds < cues[0].time) return null;

  let low = 0;
  let high = cues.length - 1;
  let best = 0;
  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    if (cues[mid].time <= localSeconds) {
      best = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return cues[best] ?? null;
}

export function mouthCueState(cues: MouthCue[], localSeconds: number): 0 | 1 | 2 {
  return activeMouthCue(cues, localSeconds)?.state ?? 0;
}

export function zundamonVisualState(clip: Clip, timeSeconds: number): ZundamonVisualState {
  const z = clip.zundamon;
  if (!z) return { assetId: null, mouthState: 0, blinking: false, bobOffset: 0 };

  const local = clipLocalTime(clip, timeSeconds);
  const activeCue = activeMouthCue(z.cues, local);
  const mouthState = activeCue?.state ?? 0;
  const blinkPeriod = Math.max(1.5, z.blinkEvery || 0);
  const blinkPhase = local % blinkPeriod;
  const blinking = Boolean(z.blinkAssetId) && blinkPhase >= blinkPeriod - 0.13;

  let assetId = mouthState === 2
    ? (activeCue?.vowel ? z.vowelAssetIds?.[activeCue.vowel] : undefined) || z.openAssetId
    : mouthState === 1
      ? (z.halfAssetId || z.openAssetId)
      : z.closedAssetId;
  if (blinking && z.blinkAssetId) assetId = z.blinkAssetId;

  const bobOffset = Math.sin(local * Math.PI * 2 * z.bobSpeed) * z.bobAmount;
  return { assetId, mouthState, blinking, bobOffset };
}
