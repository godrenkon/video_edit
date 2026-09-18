import { Diamond, Plus, Star, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createEffectInstance, getEffectDescriptor, listEffects } from '../core/effects';
import { createEffectPreset, instantiatePresetEffects, loadEffectPresets, normalizePresetName, saveEffectPresets } from '../core/effectPresets';
import { loadFavoriteEffects, saveFavoriteEffects, toggleFavoriteEffect } from '../core/effectFavorites';
import { uid } from '../core/project';
import { createVoicePresetEffects, VOICE_PRESETS, type VoicePresetId } from '../core/voicePresets';
import { isAudioEffectSupported, isRealtimeAudioEffectSupported } from '../render/audioEffects';
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
  const [favoriteKinds, setFavoriteKinds] = useState(() => loadFavoriteEffects());
  const available = useMemo(() => {
    const items = [
      ...listEffects('video').filter((effect) => isCanvasFilterEffectSupported(effect.kind)),
      ...(clip.assetId ? listEffects('audio').filter((effect) => isAudioEffectSupported(effect.kind)) : []),
    ];
    const favoriteSet = new Set(favoriteKinds);
    return items.sort((a, b) => Number(favoriteSet.has(b.kind)) - Number(favoriteSet.has(a.kind)));
  }, [clip.assetId, favoriteKinds]);
  const [kind, setKind] = useState(available[0]?.kind ?? '');
  const [presets, setPresets] = useState(() => loadEffectPresets());
  const [presetId, setPresetId] = useState('');
  const [presetName, setPresetName] = useState('');
  const [voicePresetId, setVoicePresetId] = useState<VoicePresetId>('voicevox-balanced');
  const selectedKind = available.some((effect) => effect.kind === kind) ? kind : available[0]?.kind ?? '';
  const effects = clip.effects ?? [];
  const selectedPreset = presets.find((preset) => preset.id === presetId) ?? presets[0] ?? null;
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

  const toggleSelectedFavorite = () => {
    if (!selectedKind) return;
    const next = toggleFavoriteEffect(favoriteKinds, selectedKind);
    setFavoriteKinds(next);
    saveFavoriteEffects(next);
  };

  const commitPresets = (next: typeof presets) => {
    setPresets(next);
    saveEffectPresets(next);
    if (presetId && !next.some((preset) => preset.id === presetId)) {
      setPresetId(next[0]?.id ?? '');
    }
  };

  const saveCurrentPreset = () => {
    if (effects.length === 0) return;
    const name = normalizePresetName(presetName) || `Preset ${presets.length + 1}`;
    const preset = createEffectPreset(name, effects);
    const next = [preset, ...presets].slice(0, 100);
    commitPresets(next);
    setPresetId(preset.id);
    setPresetName('');
  };

  const applyPreset = (append: boolean) => {
    if (!selectedPreset) return;
    const instantiated = instantiatePresetEffects(selectedPreset);
    onClip({ effects: append ? [...effects, ...instantiated] : instantiated });
  };

  const deletePreset = () => {
    if (!selectedPreset) return;
    commitPresets(presets.filter((preset) => preset.id !== selectedPreset.id));
  };

  const applyVoicePreset = () => {
    const visualEffects = effects.filter((effect) => getEffectDescriptor(effect.kind)?.domain !== 'audio');
    onClip({ effects: [...visualEffects, ...createVoicePresetEffects(voicePresetId)] });
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

      {clip.assetId && (
        <div className="voicePresetCard">
          <div className="voicePresetTitle">
            <strong>VOICEVOX音声preset</strong>
            <span>{VOICE_PRESETS.find((preset) => preset.id === voicePresetId)?.description}</span>
          </div>
          <div className="voicePresetRow">
            <select value={voicePresetId} onChange={(event) => setVoicePresetId(event.target.value as VoicePresetId)} aria-label="VOICEVOX音声preset">
              {VOICE_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
            </select>
            <button type="button" onClick={applyVoicePreset}>音声effectへ適用</button>
          </div>
          <div className="effectsTime">映像effectは保持し、音声effectチェーンのみ置換</div>
        </div>
      )}

      <div className="effectPresetCard">
        <div className="effectPresetSave">
          <input
            value={presetName}
            onChange={(event) => setPresetName(event.target.value)}
            placeholder="preset名"
            maxLength={80}
            aria-label="preset名"
          />
          <button type="button" onClick={saveCurrentPreset} disabled={effects.length === 0}>保存</button>
        </div>
        <div className="effectPresetApply">
          <select
            value={selectedPreset?.id ?? ''}
            onChange={(event) => setPresetId(event.target.value)}
            disabled={presets.length === 0}
            aria-label="エフェクトpreset"
          >
            {presets.length === 0 && <option value="">presetなし</option>}
            {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
          </select>
          <button type="button" onClick={() => applyPreset(false)} disabled={!selectedPreset}>置換</button>
          <button type="button" onClick={() => applyPreset(true)} disabled={!selectedPreset}>追加</button>
          <button type="button" className="danger" onClick={deletePreset} disabled={!selectedPreset}>削除</button>
        </div>
        <div className="effectsTime">preset適用時はeffect / keyframe IDを再生成</div>
      </div>

      <div className="effectsAddRow">
        <select value={selectedKind} onChange={(event) => setKind(event.target.value)} aria-label="追加するエフェクト">
          {available.map((effect) => (
            <option key={effect.kind} value={effect.kind}>
              {favoriteKinds.includes(effect.kind) ? '★ ' : ''}{effect.domain === 'audio' ? `音声 / ${effect.label}` : effect.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`miniBtn effectFavoriteBtn ${favoriteKinds.includes(selectedKind) ? 'active' : ''}`}
          onClick={toggleSelectedFavorite}
          disabled={!selectedKind}
          title={favoriteKinds.includes(selectedKind) ? 'お気に入りから外す' : 'お気に入りに追加'}
          aria-label={favoriteKinds.includes(selectedKind) ? 'お気に入りから外す' : 'お気に入りに追加'}
        >
          <Star size={13} fill={favoriteKinds.includes(selectedKind) ? 'currentColor' : 'none'} />
        </button>
        <button type="button" className="miniBtn" onClick={addEffect} disabled={!selectedKind} title="エフェクトを追加"><Plus size={14} /></button>
      </div>

      {effects.length === 0 && <div className="effectsEmpty">エフェクトなし</div>}
      {effects.map((effect) => {
        const descriptor = getEffectDescriptor(effect.kind);
        const renderSupported = descriptor?.domain === 'audio'
          ? isAudioEffectSupported(effect.kind)
          : isCanvasFilterEffectSupported(effect.kind);
        const realtimeSupported = descriptor?.domain === 'audio'
          ? isRealtimeAudioEffectSupported(effect.kind)
          : renderSupported;
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
              {renderSupported && !realtimeSupported && <span className="effectPending">書出しのみ</span>}
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
