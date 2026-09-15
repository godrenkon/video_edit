import type { EffectInstance, EffectParameter, EffectParameterValue } from '../types/editor';
import { uid } from './project';

export type EffectDomain = 'video' | 'audio';
export type EffectBackend = 'webgpu' | 'webgl2' | 'canvas2d' | 'webaudio' | 'audioworklet';
export type ParameterControl = 'slider' | 'number' | 'color' | 'toggle' | 'select';

export interface EffectParameterDescriptor {
  id: string;
  label: string;
  control: ParameterControl;
  defaultValue: EffectParameterValue;
  min?: number;
  max?: number;
  step?: number;
  options?: Array<{ label: string; value: string | number }>;
  keyframeable?: boolean;
}

export interface EffectDescriptor {
  kind: string;
  label: string;
  category: string;
  domain: EffectDomain;
  preferredBackend: EffectBackend;
  fallbackBackend?: EffectBackend;
  parameters: EffectParameterDescriptor[];
}

const video = (
  kind: string,
  label: string,
  category: string,
  parameters: EffectParameterDescriptor[],
  preferredBackend: EffectBackend = 'webgpu',
  fallbackBackend: EffectBackend = 'webgl2',
): EffectDescriptor => ({ kind, label, category, domain: 'video', preferredBackend, fallbackBackend, parameters });

const audio = (
  kind: string,
  label: string,
  category: string,
  parameters: EffectParameterDescriptor[],
  preferredBackend: EffectBackend = 'webaudio',
): EffectDescriptor => ({ kind, label, category, domain: 'audio', preferredBackend, parameters });

const n = (
  id: string,
  label: string,
  defaultValue: number,
  min: number,
  max: number,
  step = 0.01,
): EffectParameterDescriptor => ({
  id,
  label,
  control: 'slider',
  defaultValue,
  min,
  max,
  step,
  keyframeable: true,
});

export const BUILTIN_EFFECTS: EffectDescriptor[] = [
  video('brightness-contrast', '明るさ / コントラスト', 'Color', [
    n('brightness', '明るさ', 0, -1, 1),
    n('contrast', 'コントラスト', 1, 0, 2),
  ]),
  video('exposure', '露出', 'Color', [
    n('exposure', '露出', 0, -5, 5, 0.05),
    n('offset', 'オフセット', 0, -1, 1),
  ]),
  video('saturation', '彩度', 'Color', [n('saturation', '彩度', 1, 0, 3)]),
  video('temperature-tint', '色温度 / ティント', 'Color', [
    n('temperature', '色温度', 0, -1, 1),
    n('tint', 'ティント', 0, -1, 1),
  ]),
  video('blur', 'ブラー', 'Blur', [n('radius', '半径', 0, 0, 100, 0.25)]),
  video('sharpen', 'シャープ', 'Detail', [n('amount', '強度', 0, 0, 3)]),
  video('vignette', 'ビネット', 'Stylize', [
    n('amount', '強度', 0, -1, 1),
    n('size', 'サイズ', 0.75, 0, 1),
    n('softness', 'ぼかし', 0.5, 0, 1),
  ]),
  video('chroma-key', 'クロマキー', 'Keying', [
    { id: 'color', label: 'キー色', control: 'color', defaultValue: '#00ff00', keyframeable: false },
    n('similarity', '類似度', 0.35, 0, 1),
    n('smoothness', '境界', 0.08, 0, 0.5),
    n('spill', '色かぶり除去', 0.5, 0, 1),
  ]),
  video('drop-shadow', 'ドロップシャドウ', 'Stylize', [
    { id: 'color', label: '色', control: 'color', defaultValue: '#000000', keyframeable: false },
    n('opacity', '不透明度', 0.5, 0, 1),
    n('distance', '距離', 16, 0, 200, 1),
    n('angle', '角度', 45, -180, 180, 1),
    n('blur', 'ぼかし', 12, 0, 100, 0.5),
  ]),
  audio('gain', 'ゲイン', 'Volume', [n('gainDb', 'ゲイン(dB)', 0, -60, 24, 0.1)]),
  audio('pan', 'パン', 'Spatial', [n('pan', '左右', 0, -1, 1)]),
  audio('high-pass', 'ハイパス', 'EQ', [n('frequency', '周波数(Hz)', 80, 20, 20000, 1)]),
  audio('low-pass', 'ローパス', 'EQ', [n('frequency', '周波数(Hz)', 18000, 20, 20000, 1)]),
  audio('compressor', 'コンプレッサー', 'Dynamics', [
    n('threshold', 'Threshold(dB)', -24, -100, 0, 0.1),
    n('ratio', 'Ratio', 4, 1, 20, 0.1),
    n('attack', 'Attack(s)', 0.003, 0, 1, 0.001),
    n('release', 'Release(s)', 0.25, 0, 1, 0.001),
  ]),
];

const byKind = new Map(BUILTIN_EFFECTS.map((descriptor) => [descriptor.kind, descriptor]));

export function getEffectDescriptor(kind: string) {
  return byKind.get(kind) ?? null;
}

export function listEffects(domain?: EffectDomain) {
  return domain ? BUILTIN_EFFECTS.filter((effect) => effect.domain === domain) : BUILTIN_EFFECTS;
}

export function createEffectInstance(kind: string): EffectInstance {
  const descriptor = getEffectDescriptor(kind);
  if (!descriptor) throw new Error(`Unknown effect: ${kind}`);

  const parameters = Object.fromEntries(
    descriptor.parameters.map((parameter) => [
      parameter.id,
      { value: structuredClone(parameter.defaultValue) } satisfies EffectParameter,
    ]),
  );

  return {
    id: uid('fx'),
    kind,
    enabled: true,
    parameters,
  };
}

export function validateEffectInstance(effect: EffectInstance) {
  const descriptor = getEffectDescriptor(effect.kind);
  if (!descriptor) return false;
  return descriptor.parameters.every((parameter) => parameter.id in effect.parameters);
}
