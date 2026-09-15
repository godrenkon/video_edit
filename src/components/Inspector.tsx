import { SlidersHorizontal, Trash2 } from 'lucide-react';
import type { Clip, Project } from '../types/editor';

interface Props {
  project: Project;
  selectedClip: Clip | null;
  onProject: (patch: Partial<Project>) => void;
  onClip: (patch: Partial<Clip>) => void;
  onTransform: (key: keyof Clip['transform'], value: number) => void;
  onDeleteClip: () => void;
}

export function Inspector({ project, selectedClip, onProject, onClip, onTransform, onDeleteClip }: Props) {
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
              <RangeField label="音量" value={selectedClip.volume} min={0} max={1} step={0.01} onChange={(v) => onClip({ volume: v })} />
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
          <div className="infoCard">クリップを選択すると、位置・拡大率・回転・透明度・音量を編集できます。</div>
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
