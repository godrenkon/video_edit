import { Diamond, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createEffectInstance, getEffectDescriptor, listEffects } from '../core/effects';
import { uid } from '../core/project';
import { isAudioEffectSupported } from '../render/audioEffects';
import {
  evaluateEffectParameter,
  isCanvasFilterEffectSupported,
} from '../render/effectEvaluation';
import type { Clip, EffectInstance, EffectParameter, EffectParameterValue, Interpolation } from '../types/editor';
import '../effects-panel.css';

interface Props {
  clip: Clip;
  timelineTime: number;
  fps: number;
  onClip: (patch: Partial<Clip>) => void;
}

export function EffectsPanel({ clip, timelineTime, fps, onClip }: Props) {
  const available = useMemo(() => [
    ...listEffects('video').filter((effect) => isCanvasFilterEffectSupported(effect.kind)),
    ...(clip.assetId ? listEffects('audio').filter((effect) => isAudioEffectSupported(effect.kind)) : []),
  ], [clip.assetId]);
  const [kind, setKind] = useState(available[0]?.kind ?? '');
  const selectedKind = available.some((effect) => effect.kind === kind) ? kind : available[0]?.kind ?? '';
  const effects = clip.effects ?? [];
  const frameDuration = 1 / Math.max(1, fps);
  const localTime = quantize(Math.max(0, Math.min(clip.duration, timelineTime - clip.start)), fps);

  const replaceEffect = (effectId: string, replacement: EffectInstance) => {
    onClip({ effects: effects.map((effect) => effect.id === effectId ? replacement : effect) });
  };

  const removeEffect = (effectId: string) => {
    onClip({ effects: effects.filter((effect) => effect.id !== effectId) });
  };

  const addEffect = () => {
    if (!selectedKind) return;
    onClip({ effects: [...effects, createEffectInstance(selectedKind)] });
  };

  const updateParameter = (
    effect: EffectInstance,
    parameterId: string,
    parameter: EffectParameter,
    value: EffectParameterValue,
  ) => {
    const keyframes = parameter.keyframes?.slice() ?? [];
    if (keyframes.length > 0) {
      const index = findKeyframeIndex(keyframes, localTime, frameDuration / 2);
      if (index >= 0) keyframes[index] = { ...keyframes[index], value: cloneValue(value), time: localTime };
      else keyframes.push({ id: uid('kf'), time: localTime, value: cloneValue(value), interpolation: 'linear' });
      keyframes.sort((a, b) => a.time - b.time);
      replaceParameter(effect, parameterId, { ...parameter, keyframes });
    } else {
      replaceParameter(effect, parameterId, { ...parameter, value: cloneValue(value) });
    }
  };

  const toggleKeyframe = (effect: EffectInstance, parameterId: string, parameter: EffectParameter) => {
    const keyframes = parameter.keyframes?.slice() ?? [];
    const index = findKeyframeIndex(keyframes, localTime, frameDuration / 2);
    if (index >= 0) {
      keyframes.splice(index, 1);
      replaceParameter(effect, parameterId, { ...parameter, keyframes: keyframes.length ? keyframes : undefined });
      return;
    }
    const value = evaluateEffectParameter(parameter, localTime);
    keyframes.push({ id: uid('kf'), time: localTime, value: cloneValue(value), interpolation: 'linear' });
    keyframes.sort((a, b) => a.time - b.time);
    replaceParameter(effect, parameterId, { ...parameter, keyframes });
  };

  const setInterpolation = (
    effect: EffectInstance,
    parameterId: string,
    parameter: EffectParameter,
    interpolation: Interpolation,
  ) => {
    const keyframes = parameter.keyframes?.slice() ?? [];
    const index = findKeyframeIndex(keyframes, localTime, frameDuration / 2);
    if (index < 0) return;
    keyframes[index] = { ...keyframes[index], interpolation };
    replaceParameter(effect, parameterId, { ...parameter, keyframes });
  };

  const replaceParameter = (effect: EffectInstance, parameterId: string, parameter: EffectParameter) => {
    replaceEffect(effect.id, {
      ...effect,
      parameters: { ...effect.parameters, [parameterId]: parameter },
    });
  };

  const setFade = (key: 'fadeIn' | 'fadeOut', value: number) => {
    const safe = Number.isFinite(value) ? Math.max(0, Math.min(clip.duration, value)) : 0;
    onClip({ [key]: safe } as Pick<Clip, 'fadeIn' | 'fadeOut'>);
  };

  return (
    <section className="effectsEditor">
      {clip.assetId && (
        <div className="effectCard audioFadeCard">
          <div className="effectCardHeader"><strong>音声フェード</strong><span className="effectPending">clip</span></div>
          <div className="audioFadeGrid">
            <label className="effectParameter">
              <span>フェードイン <b>{formatSeconds(clip.fadeIn ?? 0)}</b></span>
              <input
                type="number"
                min={0}
                max={clip.duration}
                step={0.05}
                value={Number((clip.fadeIn ?? 0).toFixed(3))}
                onChange={(event) => setFade('fadeIn', Number(event.target.value))}
              />
            </label>
            <label className="effectParameter">
              <span>フェードアウト <b>{formatSeconds(clip.fadeOut ?? 0)}</b></span>
              <input
                type="number"
                min={0}
                max={clip.duration}
                step={0.05}
                value={Number((clip.fadeOut ?? 0).toFixed(3))}
                onChange={(event) => setFade('fadeOut', Number(event.target.value))}
              />
            </label>
          </div>
          <div className="effectsTime">Preview / MP4 / WebM で同じlinear envelopeを使用</div>
        </div>
      )}

      <div className="effectsTime">再生ヘッド: {localTime.toFixed(3)}s / clip</div>
      <div className="effectsAddRow">
        <select value={selectedKind} onChange={(event) => setKind(event.target.value)} aria-label="追加するエフェクト">
          {available.map((effect) => (
            <option key={effect.kind} value={effect.kind}>{effect.domain === 'audio' ? `音声 / ${effect.label}` : effect.label}</option>
          ))}
        </select>
        <button type="button" className="miniBtn" onClick={addEffect} disabled={!selectedKind} title="エフェクトを追加"><Plus size={14} /></button>
      </div>

      {effects.length === 0 && <div className="effectsEmpty">エフェクトなし</div>}
      {effects.map((effect) => {
        const descriptor = getEffectDescriptor(effect.kind);
        const renderSupported = descriptor?.domain === 'audio'
          ? isAudioEffectSupported(effect.kind)
          : isCanvasFilterEffectSupported(effect.kind);
        return (
          <div className="effectCard" key={effect.id}>
            <div className="effectCardHeader">
              <label>
                <input
                  type="checkbox"
                  checked={effect.enabled}
                  onChange={(event) => replaceEffect(effect.id, { ...effect, enabled: event.target.checked })}
                />
                <strong>{descriptor?.domain === 'audio' ? `音声 / ${descriptor.label}` : descriptor?.label ?? effect.kind}</strong>
              </label>
              {!renderSupported && <span className="effectPending">未接続</span>}
              <button type="button" className="miniBtn danger" onClick={() => removeEffect(effect.id)} title="エフェクトを削除"><Trash2 size={13} /></button>
            </div>
            {descriptor?.parameters.map((descriptorParameter) => {
              const current = effect.parameters[descriptorParameter.id];
              if (!current) return null;
              const evaluated = current.keyframes?.length ? evaluateEffectParameter(current, localTime) : current.value;
              const activeKeyframeIndex = findKeyframeIndex(current.keyframes ?? [], localTime, frameDuration / 2);
              const activeKeyframe = activeKeyframeIndex >= 0 ? current.keyframes?.[activeKeyframeIndex] : undefined;
              const setValue = (value: EffectParameterValue) => updateParameter(effect, descriptorParameter.id, current, value);

              if (descriptorParameter.control === 'color') {
                return (
                  <label className="effectParameter" key={descriptorParameter.id}>
                    <span>{descriptorParameter.label}</span>
                    <input type="color" value={safeColor(evaluated, descriptorParameter.defaultValue)} onChange={(event) => setValue(event.target.value)} />
                  </label>
                );
              }
              if (descriptorParameter.control === 'toggle') {
                return (
                  <label className="effectParameter effectToggle" key={descriptorParameter.id}>
                    <span>{descriptorParameter.label}</span>
                    <input type="checkbox" checked={Boolean(evaluated)} onChange={(event) => setValue(event.target.checked)} />
                  </label>
                );
              }
              if (descriptorParameter.control === 'select') {
                return (
                  <label className="effectParameter" key={descriptorParameter.id}>
                    <span>{descriptorParameter.label}</span>
                    <select value={String(evaluated)} onChange={(event) => setValue(event.target.value)}>
                      {descriptorParameter.options?.map((option) => <option key={String(option.value)} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                );
              }

              const numeric = typeof evaluated === 'number'
                ? evaluated
                : typeof descriptorParameter.defaultValue === 'number' ? descriptorParameter.defaultValue : 0;
              return (
                <div className="effectParameter effectAnimatedParameter" key={descriptorParameter.id}>
                  <span>{descriptorParameter.label}<b>{formatNumber(numeric)}</b></span>
                  <div className="effectParameterControls">
                    <input
                      type="range"
                      min={descriptorParameter.min ?? 0}
                      max={descriptorParameter.max ?? 1}
                      step={descriptorParameter.step ?? 0.01}
                      value={numeric}
                      onChange={(event) => setValue(Number(event.target.value))}
                    />
                    {descriptorParameter.keyframeable && (
                      <button
                        type="button"
                        className={`keyframeBtn ${activeKeyframe ? 'active' : ''}`}
                        onClick={() => toggleKeyframe(effect, descriptorParameter.id, current)}
                        title={activeKeyframe ? 'この位置のキーフレームを削除' : 'この位置にキーフレームを追加'}
                      >
                        <Diamond size={11} fill={activeKeyframe ? 'currentColor' : 'none'} />
                      </button>
                    )}
                  </div>
                  {activeKeyframe && (
                    <select
                      className="keyframeInterpolation"
                      value={activeKeyframe.interpolation}
                      onChange={(event) => setInterpolation(effect, descriptorParameter.id, current, event.target.value as Interpolation)}
                      aria-label={`${descriptorParameter.label}の補間`}
                    >
                      <option value="hold">Hold</option>
                      <option value="linear">Linear</option>
                      <option value="bezier">Bezier</option>
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}

function findKeyframeIndex(keyframes: NonNullable<EffectParameter['keyframes']>, time: number, epsilon: number) {
  return keyframes.findIndex((keyframe) => Math.abs(keyframe.time - time) <= epsilon + Number.EPSILON);
}

function quantize(time: number, fps: number) {
  const safeFps = Math.max(1, fps);
  return Math.round(time * safeFps) / safeFps;
}

function cloneValue(value: EffectParameterValue): EffectParameterValue {
  return Array.isArray(value) ? [...value] : value;
}

function safeColor(value: EffectParameterValue, fallback: EffectParameterValue) {
  const preferred = typeof value === 'string' ? value : typeof fallback === 'string' ? fallback : '#000000';
  return /^#[0-9a-f]{6}$/i.test(preferred) ? preferred : '#000000';
}

function formatNumber(value: number) {
  if (Math.abs(value) >= 100) return Math.round(value).toString();
  return Number(value.toFixed(2)).toString();
}

function formatSeconds(value: number) {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  return `${Number(safe.toFixed(2))}s`;
}
