import { describe, expect, it } from 'vitest';
import { defaultGeneratorClip, defaultSubtitleClip, defaultTextClip } from './project';

describe('synthetic clip defaults', () => {
  it('creates editable text clips with serializable styling', () => {
    const clip = defaultTextClip(3);
    expect(clip.kind).toBe('text');
    expect(clip.start).toBe(3);
    expect(clip.duration).toBe(5);
    expect(clip.text).toMatchObject({ text: 'テキスト', fontSize: 72, color: '#ffffff', align: 'center' });
  });

  it('creates subtitle clips at the requested vertical position', () => {
    const clip = defaultSubtitleClip(2, 350, 4);
    expect(clip.kind).toBe('subtitle');
    expect(clip.subtitle?.text).toBe('字幕テキスト');
    expect(clip.transform.y).toBe(350);
  });

  it('creates generator defaults for each renderer-backed kind', () => {
    expect(defaultGeneratorClip(0, 'color').generator).toEqual({ kind: 'color', data: { color: '#202830' } });
    expect(defaultGeneratorClip(0, 'gradient').generator).toEqual({ kind: 'gradient', data: { startColor: '#161b22', endColor: '#5fd8ff', angle: 0 } });
    expect(defaultGeneratorClip(0, 'noise').generator).toEqual({ kind: 'noise', data: { speed: 8 } });
    expect(defaultGeneratorClip(0, 'bars').generator).toEqual({ kind: 'bars', data: undefined });
  });
});
