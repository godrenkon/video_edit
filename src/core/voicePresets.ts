import type { EffectInstance } from '../types/editor';
import { createEffectInstance } from './effects';

export type VoicePresetId = 'voicevox-balanced' | 'voicevox-clear' | 'voicevox-soft';

export interface VoicePresetDescriptor {
  id: VoicePresetId;
  label: string;
  description: string;
}

export const VOICE_PRESETS: VoicePresetDescriptor[] = [
  {
    id: 'voicevox-balanced',
    label: 'VOICEVOX / バランス',
    description: '軽いハイパス + コンプレッサー + リミッター',
  },
  {
    id: 'voicevox-clear',
    label: 'VOICEVOX / くっきり',
    description: '不要な低域と高域を整理し、声の存在感を安定化',
  },
  {
    id: 'voicevox-soft',
    label: 'VOICEVOX / やわらか',
    description: '控えめな圧縮で自然な音量差を残す',
  },
];

export function createVoicePresetEffects(id: VoicePresetId): EffectInstance[] {
  if (id === 'voicevox-clear') {
    return [
      withNumber(createEffectInstance('high-pass'), 'frequency', 100),
      withNumber(createEffectInstance('low-pass'), 'frequency', 14_000),
      compressor(-20, 4, 0.004, 0.14),
      withNumber(createEffectInstance('limiter'), 'ceiling', -1),
    ];
  }

  if (id === 'voicevox-soft') {
    return [
      withNumber(createEffectInstance('high-pass'), 'frequency', 70),
      compressor(-16, 2.5, 0.008, 0.2),
      withNumber(createEffectInstance('limiter'), 'ceiling', -1),
    ];
  }

  return [
    withNumber(createEffectInstance('high-pass'), 'frequency', 80),
    compressor(-18, 3, 0.005, 0.16),
    withNumber(createEffectInstance('limiter'), 'ceiling', -1),
  ];
}

function compressor(threshold: number, ratio: number, attack: number, release: number) {
  let effect = createEffectInstance('compressor');
  effect = withNumber(effect, 'threshold', threshold);
  effect = withNumber(effect, 'ratio', ratio);
  effect = withNumber(effect, 'attack', attack);
  effect = withNumber(effect, 'release', release);
  return effect;
}

function withNumber(effect: EffectInstance, parameterId: string, value: number): EffectInstance {
  const parameter = effect.parameters[parameterId];
  if (!parameter) throw new Error(`Missing parameter ${parameterId} on ${effect.kind}`);
  return {
    ...effect,
    parameters: {
      ...effect.parameters,
      [parameterId]: {
        ...parameter,
        value,
        keyframes: undefined,
      },
    },
  };
}
