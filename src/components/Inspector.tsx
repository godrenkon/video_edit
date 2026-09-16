import { RotateCcw, SlidersHorizontal, Trash2 } from 'lucide-react';
import { constrainNormalizedCrop, cropToNormalized } from '../render/cropGeometry';
import type { BlendMode, Clip, Crop, GeneratorPayload, Project, TextPayload } from '../types/editor';
import { EffectsPanel } from './EffectsPanel';
import '../creation-tools.css';

interface Props {
  project: Project;
  selectedClip: Clip | null;
  timelineTime: number;
  onProject: (patch: Partial<Project>) => void;
  onClip: (patch: Partial<Clip>) => void;
  onTransform: (key: keyof Clip['transform'], value: number) => void;
  onDeleteClip: () => void;
}

const blendModes: BlendMode[] = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'difference', 'add'];

export function Inspector({ project, selectedClip, timelineTime, onProject, onClip, onTransform, onDeleteClip }: Props) {
  const selectedAsset = selectedClip?.assetId ? project.assets.find((asset) => asset.id === selectedClip.assetId) : undefined;
  const crop = selectedClip && selectedAsset && selectedAsset.kind !== 'audio'
    ? cropToNormalized(selectedClip.crop, selectedAsset.width ?? project.width, selectedAsset.height ?? project.height)
    : null;

  const patchText = (patch: Partial<TextPayload>) => {
    const current: TextPayload = selectedClip?.text ?? { text: 'テキスト' };
    onClip({ text: { ...current, ...patch } });
  };

  const patchGenerator = (patch: Partial<GeneratorPayload>) => {
    if (!selectedClip?.generator) return;
    onClip({ generator: { ...selectedClip.generator, ...patch } });
  };

  const patchGeneratorData = (key: string, value: string | number | boolean | number[]) => {
    if (!selectedClip?.generator) return;
    onClip({ generator: { ...selectedClip.generator, data: { ...selectedClip.generator.data, [key]: value } } });
  };

  const patchCrop = (edge: keyof Crop, percent: number) => {
    if (!crop) return;
    const next = constrainNormalizedCrop({ ...crop, [edge]: Math.max(0, Math.min(99, percent)) / 100 }, edge);
    const empty = Object.values(next).every((value) => value <= 1e-6);
    onClip({ crop: empty ? undefined : next });
  };

  return (
    <aside className="panel inspectorPanel">
      <div className="panelHeader"><div><strong>インスペクター</strong><span>properties</span></div><SlidersHorizontal size={17} /></div>
      {selectedClip ? (
        <div className="inspectorBody">
          <Field label="名前"><input value={selectedClip.name} onChange={(e) => onClip({ name: e.target.value })} /></Field>
          <div className="twoFields">
            <NumberField label="開始" value={selectedClip.start} step={0.1} onChange={(v) => onClip({ start: Math.max(0, v) })} />
            <NumberField label="長さ" value={selectedClip.duration} step={0.1} onChange={(v) => onClip({ duration: Math.max(0.1, v) })} />
          </div>

          {selectedClip.kind === 'text' && selectedClip.text && (
            <>
              <h3>テキスト</h3>
              <Field label="内容"><textarea rows={4} value={selectedClip.text.text} onChange={(e) => patchText({ text: e.target.value })} /></Field>
              <Field label="フォント"><input value={selectedClip.text.fontFamily ?? 'Noto Sans JP'} onChange={(e) => patchText({ fontFamily: e.target.value })} /></Field>
              <div className="twoFields">
                <NumberField label="サイズ" value={selectedClip.text.fontSize ?? 72} step={1} onChange={(v) => patchText({ fontSize: Math.max(8, v) })} />
                <NumberField label="太さ" value={selectedClip.text.fontWeight ?? 700} step={100} onChange={(v) => patchText({ fontWeight: Math.max(100, Math.min(1000, v)) })} />
              </div>
              <div className="twoFields">
                <Field label="文字色"><input type="color" value={safeColor(selectedClip.text.color, '#ffffff')} onChange={(e) => patchText({ color: e.target.value })} /></Field>
                <Field label="縁色"><input type="color" value={safeColor(selectedClip.text.strokeColor, '#000000')} onChange={(e) => patchText({ strokeColor: e.target.value })} /></Field>
              </div>
              <NumberField label="縁取り" value={selectedClip.text.strokeWidth ?? 0} step={1} onChange={(v) => patchText({ strokeWidth: Math.max(0, v) })} />
              <Field label="揃え">
                <select value={selectedClip.text.align ?? 'center'} onChange={(e) => patchText({ align: e.target.value as TextPayload['align'] })}>
                  <option value="left">左</option><option value="center">中央</option><option value="right">右</option>
                </select>
              </Field>
            </>
          )}

          {selectedClip.kind === 'subtitle' && selectedClip.subtitle && (
            <>
              <h3>字幕</h3>
              <Field label="内容"><textarea rows={4} value={selectedClip.subtitle.text} onChange={(e) => onClip({ subtitle: { ...selectedClip.subtitle!, text: e.target.value } })} /></Field>
              <Field label="話者"><input value={selectedClip.subtitle.speaker ?? ''} placeholder="任意" onChange={(e) => onClip({ subtitle: { ...selectedClip.subtitle!, speaker: e.target.value || undefined } })} /></Field>
              <div className="infoCard">字幕は現在、白文字＋黒縁＋半透明背景の読みやすい既定styleでPreview/WebMへ描画されます。</div>
            </>
          )}

          {selectedClip.kind === 'generator' && selectedClip.generator && (
            <>
              <h3>ジェネレーター</h3>
              <Field label="種類">
                <select value={selectedClip.generator.kind} onChange={(e) => patchGenerator({ kind: e.target.value as GeneratorPayload['kind'], data: defaultsForGenerator(e.target.value as GeneratorPayload['kind']) })}>
                  <option value="color">単色</option>
                  <option value="gradient">グラデーション</option>
                  <option value="bars">カラーバー</option>
                  <option value="noise">ノイズ</option>
                </select>
              </Field>
              {selectedClip.generator.kind === 'color' && (
                <Field label="色"><input type="color" value={safeColor(asString(selectedClip.generator.data?.color), '#202830')} onChange={(e) => patchGeneratorData('color', e.target.value)} /></Field>
              )}
              {selectedClip.generator.kind === 'gradient' && (
                <>
                  <div className="twoFields">
                    <Field label="開始色"><input type="color" value={safeColor(asString(selectedClip.generator.data?.startColor), '#161b22')} onChange={(e) => patchGeneratorData('startColor', e.target.value)} /></Field>
                    <Field label="終了色"><input type="color" value={safeColor(asString(selectedClip.generator.data?.endColor), '#5fd8ff')} onChange={(e) => patchGeneratorData('endColor', e.target.value)} /></Field>
                  </div>
                  <NumberField label="角度" value={asNumber(selectedClip.generator.data?.angle, 0)} step={1} onChange={(v) => patchGeneratorData('angle', v)} />
                </>
              )}
              {selectedClip.generator.kind === 'noise' && (
                <NumberField label="変化速度" value={asNumber(selectedClip.generator.data?.speed, 8)} step={1} onChange={(v) => patchGeneratorData('speed', Math.max(0, v))} />
              )}
            </>
          )}

          {selectedAsset && (selectedAsset.kind === 'video' || selectedAsset.kind === 'audio') && (
            <>
              <h3>再生</h3>
              <div className="twoFields">
                <NumberField label="速度" value={selectedClip.speed ?? 1} step={0.05} onChange={(v) => onClip({ speed: Math.max(0.0625, Math.min(16, v)) })} />
                <NumberField label="開始オフセット" value={selectedClip.inPoint} step={0.01} onChange={(v) => onClip({ inPoint: Math.max(0, Math.min(selectedAsset.duration || Number.MAX_SAFE_INTEGER, v)) })} />
              </div>
              <label className="checkboxField">
                <span>逆再生</span>
                <input type="checkbox" checked={Boolean(selectedClip.reverse)} onChange={(e) => onClip({ reverse: e.target.checked })} />
              </label>
              {selectedAsset.kind === 'audio' && selectedClip.reverse && (
                <div className="infoCard">逆再生音声は最終WebM書き出しへ反映されます。HTML Audioの制約によりPreview再生中は無音です。</div>
              )}
            </>
          )}

          {crop && selectedAsset && selectedAsset.kind !== 'audio' && (
            <>
              <h3 className="sectionTitleRow"><span>切り抜き</span><button type="button" className="miniBtn" onClick={() => onClip({ crop: undefined })} title="切り抜きをリセット"><RotateCcw size={12} /></button></h3>
              <div className="twoFields">
                <NumberField label="上 %" value={crop.top * 100} step={0.5} onChange={(v) => patchCrop('top', v)} />
                <NumberField label="右 %" value={crop.right * 100} step={0.5} onChange={(v) => patchCrop('right', v)} />
                <NumberField label="下 %" value={crop.bottom * 100} step={0.5} onChange={(v) => patchCrop('bottom', v)} />
                <NumberField label="左 %" value={crop.left * 100} step={0.5} onChange={(v) => patchCrop('left', v)} />
              </div>
            </>
          )}

          {selectedClip.kind !== 'asset' || selectedClip.assetId ? (
            <>
              <h3>変形</h3>
              <div className="twoFields">
                <NumberField label="X" value={selectedClip.transform.x} onChange={(v) => onTransform('x', v)} />
                <NumberField label="Y" value={selectedClip.transform.y} onChange={(v) => onTransform('y', v)} />
                <NumberField label="拡大率" value={selectedClip.transform.scale} step={0.05} onChange={(v) => onTransform('scale', Math.max(0.05, v))} />
                <NumberField label="回転" value={selectedClip.transform.rotation} step={1} onChange={(v) => onTransform('rotation', v)} />
              </div>
              <RangeField label="不透明度" value={selectedClip.transform.opacity} min={0} max={1} step={0.01} onChange={(v) => onTransform('opacity', v)} />
              <Field label="合成">
                <select value={selectedClip.blendMode ?? 'normal'} onChange={(e) => onClip({ blendMode: e.target.value as BlendMode })}>
                  {blendModes.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                </select>
              </Field>
              {(selectedClip.kind === 'asset' || selectedClip.kind === 'zundamon') && (
                <RangeField label="音量" value={selectedClip.volume} min={0} max={1} step={0.01} onChange={(v) => onClip({ volume: v })} />
              )}
              <h3>エフェクト</h3>
              <EffectsPanel clip={selectedClip} timelineTime={timelineTime} fps={project.fps} onClip={onClip} />
            </>
          ) : null}
          <button className="dangerButton" onClick={onDeleteClip}><Trash2 size={15} />クリップを削除</button>
        </div>
      ) : (
        <div className="inspectorBody">
          <h3>プロジェクト</h3>
          <div className="twoFields">
            <NumberField label="幅" value={project.width} step={1} onChange={(v) => onProject({ width: Math.max(16, Math.round(v)) })} />
            <NumberField label="高さ" value={project.height} step={1} onChange={(v) => onProject({ height: Math.max(16, Math.round(v)) })} />
            <NumberField label="FPS" value={project.fps} step={1} onChange={(v) => onProject({ fps: Math.max(1, Math.min(120, Math.round(v))) })} />
          </div>
          <Field label="背景"><input type="color" value={project.background} onChange={(e) => onProject({ background: e.target.value })} /></Field>
          <div className="infoCard">クリップを選択すると、内容・速度・切り抜き・位置・エフェクトなどを編集できます。</div>
        </div>
      )}
    </aside>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function NumberField({ label, value, step = 1, onChange }: { label: string; value: number; step?: number; onChange: (v: number) => void }) {
  return <Field label={label}><input type="number" value={Number(value.toFixed(3))} step={step} onChange={(e) => onChange(Number(e.target.value))} /></Field>;
}

function RangeField({ label, value, min, max, step, onChange }: { label: string; value: number; min: number; max: number; step: number; onChange: (v: number) => void }) {
  return <label className="rangeField"><span>{label}<b>{Math.round(value * 100)}%</b></span><input type="range" value={value} min={min} max={max} step={step} onChange={(e) => onChange(Number(e.target.value))} /></label>;
}

function safeColor(value: string | undefined, fallback: string) {
  return value && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function defaultsForGenerator(kind: GeneratorPayload['kind']): GeneratorPayload['data'] {
  if (kind === 'gradient') return { startColor: '#161b22', endColor: '#5fd8ff', angle: 0 };
  if (kind === 'noise') return { speed: 8 };
  if (kind === 'color') return { color: '#202830' };
  return undefined;
}
