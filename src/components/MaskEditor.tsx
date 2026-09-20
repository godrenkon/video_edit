import { Circle, Plus, Square, Trash2 } from 'lucide-react';
import { uid } from '../core/project';
import type { Clip, ClipMask, MaskKind, MaskOperation } from '../types/editor';
import '../mask-editor.css';

interface Props {
  clip: Clip;
  onClip: (patch: Partial<Clip>) => void;
}

export function MaskEditor({ clip, onClip }: Props) {
  const masks = clip.masks ?? [];

  const commit = (next: ClipMask[]) => {
    onClip({ masks: next.length ? next : undefined });
  };

  const addMask = (kind: MaskKind) => {
    const mask: ClipMask = {
      id: uid('mask'),
      kind,
      operation: masks.length === 0 ? 'add' : 'add',
      enabled: true,
      x: 0.5,
      y: 0.5,
      width: kind === 'ellipse' ? 0.55 : 0.6,
      height: kind === 'ellipse' ? 0.55 : 0.6,
      feather: 0,
      invert: false,
    };
    commit([...masks, mask]);
  };

  const patchMask = (maskId: string, patch: Partial<ClipMask>) => {
    commit(masks.map((mask) => mask.id === maskId ? { ...mask, ...patch } : mask));
  };

  const removeMask = (maskId: string) => {
    commit(masks.filter((mask) => mask.id !== maskId));
  };

  return (
    <section className="maskEditor">
      <div className="maskEditorToolbar">
        <button type="button" onClick={() => addMask('rectangle')}>
          <Square size={12} /><Plus size={10} />矩形
        </button>
        <button type="button" onClick={() => addMask('ellipse')}>
          <Circle size={12} /><Plus size={10} />楕円
        </button>
      </div>

      {masks.length === 0 && (
        <div className="maskEditorEmpty">マスクなし。追加したマスクはPreviewと最終書き出しの両方へ反映されます。</div>
      )}

      {masks.map((mask, index) => (
        <div className="maskCard" key={mask.id}>
          <div className="maskCardHeader">
            <label>
              <input
                type="checkbox"
                checked={mask.enabled}
                onChange={(event) => patchMask(mask.id, { enabled: event.target.checked })}
              />
              <strong>Mask {index + 1}</strong>
            </label>
            <button type="button" className="maskDelete" onClick={() => removeMask(mask.id)} title="マスクを削除">
              <Trash2 size={12} />
            </button>
          </div>

          <div className="maskTwoFields">
            <label>
              <span>形状</span>
              <select value={mask.kind} onChange={(event) => patchMask(mask.id, { kind: event.target.value as MaskKind })}>
                <option value="rectangle">矩形</option>
                <option value="ellipse">楕円</option>
              </select>
            </label>
            <label>
              <span>合成</span>
              <select value={mask.operation} onChange={(event) => patchMask(mask.id, { operation: event.target.value as MaskOperation })}>
                <option value="add">Add</option>
                <option value="subtract">Subtract</option>
                <option value="intersect">Intersect</option>
              </select>
            </label>
          </div>

          <MaskRange label="中心 X" value={mask.x} min={0} max={1} onChange={(value) => patchMask(mask.id, { x: value })} />
          <MaskRange label="中心 Y" value={mask.y} min={0} max={1} onChange={(value) => patchMask(mask.id, { y: value })} />
          <MaskRange label="幅" value={mask.width} min={0.01} max={2} onChange={(value) => patchMask(mask.id, { width: value })} />
          <MaskRange label="高さ" value={mask.height} min={0.01} max={2} onChange={(value) => patchMask(mask.id, { height: value })} />
          <MaskRange label="フェザー" value={mask.feather} min={0} max={1} onChange={(value) => patchMask(mask.id, { feather: value })} />

          <label className="maskInvert">
            <input
              type="checkbox"
              checked={mask.invert}
              onChange={(event) => patchMask(mask.id, { invert: event.target.checked })}
            />
            <span>反転</span>
          </label>
        </div>
      ))}
    </section>
  );
}

function MaskRange({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  const safe = Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
  return (
    <label className="maskRange">
      <span>{label}<b>{Math.round(safe * 100)}%</b></span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.005}
        value={safe}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
