import type { EffectInstance, EffectParameter, EffectParameterValue } from '../types/editor';
import { uid } from './project';

export type EffectDomain = 'video' | 'audio';
export type EffectBackend = 'webgpu' | 'webgl2' | 'canvas2d' | 'webaudio' | 'audioworklet';
export type ParameterControl = 'slider' | 'number' | 'color' | 'toggle' | 'select' | 'file';

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
  video('levels', 'レベル補正', 'Color', [
    n('inputBlack', '入力 黒', 0, 0, 1, 0.005),
    n('inputWhite', '入力 白', 1, 0, 1, 0.005),
    n('gamma', 'ガンマ', 1, 0.1, 5, 0.01),
    n('outputBlack', '出力 黒', 0, 0, 1, 0.005),
    n('outputWhite', '出力 白', 1, 0, 1, 0.005),
  ]),
  video('lift-gamma-gain', 'Lift / Gamma / Gain', 'Color', [
    n('lift', 'Lift', 0, -1, 1, 0.005),
    n('gamma', 'Gamma', 1, 0.1, 5, 0.01),
    n('gain', 'Gain', 1, 0, 4, 0.01),
  ]),
  video('tonal-ranges', 'Shadows / Mids / Highlights', 'Color', [
    n('shadows', 'Shadows', 0, -1, 1, 0.01),
    n('midtones', 'Mids', 0, -1, 1, 0.01),
    n('highlights', 'Highlights', 0, -1, 1, 0.01),
  ]),
  video('tone-curve', 'トーンカーブ (5点)', 'Color', [
    n('black', 'Black', 0, 0, 1, 0.005),
    n('shadows', 'Shadows', 0.25, 0, 1, 0.005),
    n('midtones', 'Midtones', 0.5, 0, 1, 0.005),
    n('highlights', 'Highlights', 0.75, 0, 1, 0.005),
    n('white', 'White', 1, 0, 1, 0.005),
  ]),
  video('hue-vs-sat', 'Hue vs Sat (6点)', 'Color', [
    n('red', '赤', 0, -1, 1, 0.01),
    n('yellow', '黄', 0, -1, 1, 0.01),
    n('green', '緑', 0, -1, 1, 0.01),
    n('cyan', 'シアン', 0, -1, 1, 0.01),
    n('blue', '青', 0, -1, 1, 0.01),
    n('magenta', 'マゼンタ', 0, -1, 1, 0.01),
  ]),
  video('temperature-tint', '色温度 / ティント', 'Color', [
    n('temperature', '色温度', 0, -1, 1),
    n('tint', 'ティント', 0, -1, 1),
  ]),
  video('lut-3d', '3D LUT (.cube)', 'Color', [
    { id: 'cubeData', label: 'LUTファイル', control: 'file', defaultValue: '', keyframeable: false },
    n('intensity', '強度', 1, 0, 1, 0.01),
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
  video('luma-key', 'ルミナンスキー', 'Keying', [
    n('threshold', 'しきい値', 0.5, 0, 1, 0.005),
    n('softness', '境界', 0.1, 0, 0.5, 0.005),
    { id: 'invert', label: '反転', control: 'toggle', defaultValue: false, keyframeable: false },
  ]),
  video('hue-shift', '色相シフト', 'Color', [
    n('degrees', '色相', 0, -180, 180, 1),
  ]),
  video('pixelate', 'ピクセレート', 'Stylize', [
    n('size', 'ブロックサイズ', 1, 1, 128, 1),
  ]),
  video('grain', 'フィルムグレイン', 'Stylize', [
    n('amount', '強度', 0, 0, 1, 0.01),
    n('seed', 'シード', 1, 0, 10000, 1),
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
  audio('limiter', 'リミッター', 'Dynamics', [
    n('ceiling', 'Ceiling(dB)', -1, -24, 0, 0.1),
  ]),
  audio('gate-expander', 'ゲート / エキスパンダー', 'Dynamics', [
    n('threshold', 'Threshold(dB)', -45, -100, 0, 0.1),
    n('ratio', 'Ratio', 4, 1, 20, 0.1),
    n('range', 'Range(dB)', 60, 0, 100, 0.5),
    n('attack', 'Attack(s)', 0.005, 0, 1, 0.001),
    n('release', 'Release(s)', 0.08, 0, 2, 0.001),
  ]),
  audio('de-esser', 'ディエッサー', 'Dynamics', [
    n('frequency', '検出周波数(Hz)', 6000, 2000, 14000, 10),
    n('threshold', 'Threshold(dB)', -28, -60, 0, 0.1),
    n('ratio', 'Ratio', 6, 1, 20, 0.1),
    n('maxReduction', '最大Reduction(dB)', 12, 0, 30, 0.5),
    n('attack', 'Attack(s)', 0.002, 0, 0.2, 0.001),
    n('release', 'Release(s)', 0.08, 0, 1, 0.001),
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
