import type {
  BlendMode,
  ClipKind,
  ClipMask,
  Crop,
  EffectInstance,
  GeneratorPayload,
  Project,
  SubtitlePayload,
  TextPayload,
  Transform,
} from '../types/editor';
import { visualTimelineItems, zundamonVisualState } from './timelineEvaluation';
import { transitionBrightness, transitionMotionOffset, transitionOpacity, transitionRevealRect, type TransitionRevealRect } from './transitionEnvelope';

export interface VisualFrameLayerPlan {
  clipId: string;
  trackId: string;
  trackIndex: number;
  kind: ClipKind;
  assetId: string | null;
  sourceTime: number;
  clipLocalTime: number;
  transform: Required<Pick<Transform, 'x' | 'y' | 'scale' | 'rotation' | 'opacity'>> & {
    anchorX: number;
    anchorY: number;
  };
  crop: Crop | null;
  masks: ClipMask[];
  blendMode: BlendMode;
  effects: EffectInstance[];
  text: TextPayload | null;
  subtitle: SubtitlePayload | null;
  generator: GeneratorPayload | null;
  reveal: TransitionRevealRect;
  transitionBrightness: number;
}

/**
 * Evaluates the serializable project model for one presentation time.
 *
 * The returned order is bottom-to-top draw order and is intentionally shared by
 * preview/export renderers. No DOM or codec state leaks into this function.
 */
export function buildVisualFramePlan(project: Project, timeSeconds: number): VisualFrameLayerPlan[] {
  return visualTimelineItems(project, timeSeconds).map(({ clip, track, trackIndex, sourceTime }) => {
    const zundamon = clip.kind === 'zundamon' ? zundamonVisualState(clip, timeSeconds) : null;
    const clipLocalTime = Math.max(0, Math.min(clip.duration, timeSeconds - clip.start));
    const transitionOffset = transitionMotionOffset(clip, clipLocalTime, project.width, project.height);
    return {
      clipId: clip.id,
      trackId: track.id,
      trackIndex,
      kind: clip.kind,
      assetId: zundamon?.assetId ?? clip.assetId ?? null,
      sourceTime,
      clipLocalTime,
      transform: {
        x: clip.transform.x + transitionOffset.x,
        y: clip.transform.y + transitionOffset.y + (zundamon?.bobOffset ?? 0),
        scale: clip.transform.scale,
        rotation: clip.transform.rotation,
        opacity: clip.transform.opacity * transitionOpacity(clip, clipLocalTime),
        anchorX: clip.transform.anchorX ?? 0.5,
        anchorY: clip.transform.anchorY ?? 0.5,
      },
      crop: clip.crop ? { ...clip.crop } : null,
      masks: clip.masks?.map((mask) => ({ ...mask })) ?? [],
      blendMode: clip.blendMode ?? 'normal',
      effects: clip.effects?.filter((effect) => effect.enabled).map(cloneEffect) ?? [],
      text: clip.text ? { ...clip.text } : null,
      subtitle: clip.subtitle ? {
        ...clip.subtitle,
        words: clip.subtitle.words?.map((word) => ({ ...word })),
      } : null,
      reveal: transitionRevealRect(clip, clipLocalTime),
      transitionBrightness: transitionBrightness(clip, clipLocalTime),
      generator: clip.generator ? {
        ...clip.generator,
        data: clip.generator.data ? { ...clip.generator.data } : undefined,
      } : null,
    };
  });
}

function cloneEffect(effect: EffectInstance): EffectInstance {
  return {
    ...effect,
    parameters: Object.fromEntries(Object.entries(effect.parameters).map(([key, parameter]) => [
      key,
      {
        ...parameter,
        value: Array.isArray(parameter.value) ? [...parameter.value] : parameter.value,
        keyframes: parameter.keyframes?.map((keyframe) => ({
          ...keyframe,
          value: Array.isArray(keyframe.value) ? [...keyframe.value] : keyframe.value,
          inTangent: keyframe.inTangent ? [...keyframe.inTangent] as [number, number] : undefined,
          outTangent: keyframe.outTangent ? [...keyframe.outTangent] as [number, number] : undefined,
        })),
      },
    ])),
    maskIds: effect.maskIds ? [...effect.maskIds] : undefined,
  };
}
