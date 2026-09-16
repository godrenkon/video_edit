import { Plus, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { createEffectInstance, getEffectDescriptor, listEffects } from '../core/effects';
import { isCanvasFilterEffectSupported } from '../render/effectEvaluation';
import type { Clip, EffectInstance, EffectParameterValue } from '../types/editor';
import '../effects-panel.css';

interface Props {
  clip: Clip;
  onClip: (patch: Partial<Clip>) => void;
}

export function EffectsPanel({ clip, onClip }: Props) {
  const available = useMemo(() => listEffects('video').filter((effect) => isCanvasFilterEffectSupported(effect.kind)), []);
  const [kind, setKind] = useState(available[0]?.kind ?? '');
  const effects = clip.effects ?? [];

  const replaceEffect = (effectId: string, replacement: EffectInstance) => {
    onClip({ effects: effects.map((effect) => effect.id === effectId ? replacement : effect) });
  };

  const removeEffect = (effectId: string) => {
    onClip({ effects: effects.filter((effect) => effect.id !== effectId) });
  };

  const addEffect = () => {
    if (!kind) return;
    onClip({ effects: [...effects, createEffectInstance(kind)] });
  };

  return (
    <section className="effectsEditor">
      <div className="effectsAddRow">
        <select value={kind} onChange={(event) => setKind(event.target.value)} aria-label="追加するエフェクト">
          {available.map((effect) => <option key={effect.kind} value={effect.kind}>{effect.label}</option>)}
        </select>
        <button type="button" className="miniBtn" onClick={addEffect} disabled={!kind} title="エフェクトを追加"><Plus size={14} /></button>
      </div>

      {effects.length === 0 && <div className="effectsEmpty">エフェクトなし</div>}
      {effects.map((effect) => {
        const descriptor = getEffectDescriptor(effect.kind);
        const renderSupported = isCanvasFilterEffectSupported(effect.kind);
        return (
          <div className="effectCard" key={effect.id}>
            <div className="effectCardHeader">
              <label>
                <input
                  type="checkbox"
                  checked={effect.enabled}
                  onChange={(event) => replaceEffect(effect.id, { ...effect, enabled: event.target.checked })}
                />
                <strong>{descriptor?.label ?? effect.kind}</strong>
              </label>
              {!renderSupported && <span className="effectPending">未接続</span>}
              <button type="button" className="miniBtn danger" onClick={() => removeEffect(effect.id)} title="エフェクトを削除"><Trash2 size={13} /></button>
            </div>
            {descriptor?.parameters.map((parameter) => {
              const current = effect.parameters[parameter.id];
              if (!current) return null;
              const setValue = (value: EffectParameterValue) => replaceEffect(effect.id, {
                ...effect,
                parameters: {
                  ...effect.parameters,
                  [parameter.id]: { ...current, value },
                },
              });

              if (parameter.control === 'color') {
                return (
                  <label className="effectParameter" key={parameter.id}>
                    <span>{parameter.label}</span>
                    <input type="color" value={safeColor(current.value, parameter.defaultValue)} onChange={(event) => setValue(event.target.value)} />
                  </label>
                );
              }
              if (parameter.control === 'toggle') {
                return (
                  <label className="effectParameter effectToggle" key={parameter.id}>
                    <span>{parameter.label}</span>
                    <input type="checkbox" checked={Boolean(current.value)} onChange={(event) => setValue(event.target.checked)} />
                  </label>
                );
              }
              if (parameter.control === 'select') {
                return (
                  <label className="effectParameter" key={parameter.id}>
                    <span>{parameter.label}</span>
                    <select value={String(current.value)} onChange={(event) => setValue(event.target.value)}>
                      {parameter.options?.map((option) => <option key={String(option.value)} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                );
              }

              const numeric = typeof current.value === 'number'
                ? current.value
                : typeof parameter.defaultValue === 'number' ? parameter.defaultValue : 0;
              return (
                <label className="effectParameter" key={parameter.id}>
                  <span>{parameter.label}<b>{formatNumber(numeric)}</b></span>
                  <input
                    type="range"
                    min={parameter.min ?? 0}
                    max={parameter.max ?? 1}
                    step={parameter.step ?? 0.01}
                    value={numeric}
                    onChange={(event) => setValue(Number(event.target.value))}
                  />
                </label>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}

function safeColor(value: EffectParameterValue, fallback: EffectParameterValue) {
  const preferred = typeof value === 'string' ? value : typeof fallback === 'string' ? fallback : '#000000';
  return /^#[0-9a-f]{6}$/i.test(preferred) ? preferred : '#000000';
}

function formatNumber(value: number) {
  if (Math.abs(value) >= 100) return Math.round(value).toString();
  return Number(value.toFixed(2)).toString();
}
