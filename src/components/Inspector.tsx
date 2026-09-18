import { ChevronDown, ChevronUp, Flag, Plus, RotateCcw, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { uid } from '../core/project';
import { addTrack, canRemoveTrack, moveTrack, removeTrack, renameTrack, setTrackSolo, setTrackVisible } from '../core/trackOps';
import { constrainNormalizedCrop, cropToNormalized } from '../render/cropGeometry';
import { clipSourceTime } from '../render/timelineEvaluation';
import type { BlendMode, Clip, Crop, GeneratorPayload, Project, TextPayload, TimelineMarker, TrackKind } from '../types/editor';
import { EffectsPanel } from './EffectsPanel';
import { ProjectExportSettingsPanel } from './ProjectExportSettingsPanel';
import { ProjectTemplatesPanel } from './ProjectTemplatesPanel';
import { SubtitleExchangePanel } from './SubtitleExchangePanel';
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
  const selectedSpeed = Math.max(0.0001, selectedClip?.speed ?? 1);
  const maxSourceInPoint = selectedClip && selectedAsset && (selectedAsset.kind === 'video' || selectedAsset.kind === 'audio')
    ? Math.max(0, selectedAsset.duration - selectedClip.duration * selectedSpeed)
    : 0;
  const currentSourceTime = selectedClip && selectedAsset?.kind === 'video'
    ? Math.max(0, Math.min(selectedAsset.duration, clipSourceTime(
        { ...selectedClip, freezeFrameAt: undefined },
        timelineTime,
      )))
    : 0;

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

  const markers = [...(project.markers ?? [])].sort((a, b) => a.time - b.time);
  const inPoint = Math.max(0, Math.min(project.duration, project.inPoint ?? 0));
  const outPoint = Math.max(inPoint, Math.min(project.duration, project.outPoint ?? project.duration));

  const setInPoint = (value: number) => {
    const next = Math.max(0, Math.min(value, project.outPoint ?? project.duration, project.duration));
    onProject({ inPoint: next });
  };

  const setOutPoint = (value: number) => {
    const next = Math.max(project.inPoint ?? 0, Math.min(project.duration, value));
    onProject({ outPoint: next });
  };

  const addMarker = () => {
    const time = Math.max(0, Math.min(project.duration, timelineTime));
    const marker: TimelineMarker = {
      id: uid('marker'),
      time,
      name: `マーカー ${markers.length + 1}`,
      color: '#ffc86b',
    };
    onProject({ markers: [...markers, marker].sort((a, b) => a.time - b.time) });
  };

  const patchMarker = (markerId: string, patch: Partial<TimelineMarker>) => {
    onProject({
      markers: markers
        .map((marker) => marker.id === markerId ? { ...marker, ...patch } : marker)
        .sort((a, b) => a.time - b.time),
    });
  };

  const deleteMarker = (markerId: string) => {
    onProject({ markers: markers.filter((marker) => marker.id !== markerId) });
  };

  const commitTracks = (next: Project) => onProject({ tracks: next.tracks });
  const createTrack = (kind: TrackKind) => commitTracks(addTrack(project, kind));
  const changeTrackName = (trackId: string, name: string) => commitTracks(renameTrack(project, trackId, name));
  const shiftTrack = (trackId: string, direction: -1 | 1) => commitTracks(moveTrack(project, trackId, direction));
  const toggleTrackSolo = (trackId: string, solo: boolean) => commitTracks(setTrackSolo(project, trackId, solo));
  const toggleTrackVisible = (trackId: string, visible: boolean) => commitTracks(setTrackVisible(project, trackId, visible));
  const deleteTrack = (trackId: string) => {
    const result = removeTrack(project, trackId);
    if (result.removed) commitTracks(result.project);
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
              <h3>文字背景</h3>
              <label className="checkboxField">
                <span>背景を表示</span>
                <input
                  type="checkbox"
                  checked={Boolean(selectedClip.text.backgroundColor)}
                  onChange={(e) => patchText({ backgroundColor: e.target.checked ? safeColor(selectedClip.text?.backgroundColor, '#0c1216') : undefined })}
                />
              </label>
              {selectedClip.text.backgroundColor && (
                <Field label="背景色">
                  <input
                    type="color"
                    value={safeColor(selectedClip.text.backgroundColor, '#0c1216')}
                    onChange={(e) => patchText({ backgroundColor: e.target.value })}
                  />
                </Field>
              )}
              <h3>文字シャドウ</h3>
              <div className="twoFields">
                <Field label="影の色"><input type="color" value={safeColor(selectedClip.text.shadowColor, '#000000')} onChange={(e) => patchText({ shadowColor: e.target.value })} /></Field>
                <NumberField label="ぼかし" value={selectedClip.text.shadowBlur ?? 0} step={1} onChange={(v) => patchText({ shadowBlur: Math.max(0, Math.min(100, v)) })} />
                <NumberField label="X" value={selectedClip.text.shadowOffsetX ?? 0} step={1} onChange={(v) => patchText({ shadowOffsetX: Math.max(-200, Math.min(200, v)) })} />
                <NumberField label="Y" value={selectedClip.text.shadowOffsetY ?? 0} step={1} onChange={(v) => patchText({ shadowOffsetY: Math.max(-200, Math.min(200, v)) })} />
              </div>
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
              <div className="infoCard">字幕は現在、白文字＋黒縁＋半透明背景の読みやすい既定styleでPreview/最終書き出しへ描画されます。</div>
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
                <NumberField label="開始オフセット" value={selectedClip.inPoint} step={0.01} onChange={(v) => onClip({ inPoint: Math.max(0, Math.min(maxSourceInPoint, v)) })} />
              </div>
              <div className="infoCard">使用可能な開始オフセット: 0 ～ {maxSourceInPoint.toFixed(2)}s（速度とクリップ尺を反映）</div>
              <label className="checkboxField">
                <span>逆再生</span>
                <input type="checkbox" checked={Boolean(selectedClip.reverse)} onChange={(e) => onClip({ reverse: e.target.checked })} />
              </label>
              {selectedAsset.kind === 'video' && (
                <>
                  <label className="checkboxField">
                    <span>フリーズフレーム</span>
                    <input
                      type="checkbox"
                      checked={typeof selectedClip.freezeFrameAt === 'number'}
                      onChange={(e) => onClip({ freezeFrameAt: e.target.checked ? currentSourceTime : undefined })}
                    />
                  </label>
                  {typeof selectedClip.freezeFrameAt === 'number' && (
                    <>
                      <NumberField
                        label="固定source時刻"
                        value={selectedClip.freezeFrameAt}
                        step={1 / Math.max(1, project.fps)}
                        onChange={(v) => onClip({ freezeFrameAt: Math.max(0, Math.min(selectedAsset.duration, v)) })}
                      />
                      <div className="projectActionGrid">
                        <button type="button" onClick={() => onClip({ freezeFrameAt: currentSourceTime })}>現在フレームを固定</button>
                      </div>
                      <div className="infoCard">固定中は映像source時刻を {selectedClip.freezeFrameAt.toFixed(3)}s に保持し、動画内音声は無音になります。</div>
                    </>
                  )}
                </>
              )}
              {selectedAsset.kind === 'audio' && selectedClip.reverse && (
                <div className="infoCard">逆再生音声は最終書き出しへ反映されます。HTML Audioの制約によりPreview再生中は無音です。</div>
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
              {selectedAsset?.kind !== 'audio' && (
                <>
                  <h3>トランジション</h3>
                  <div className="twoFields">
                    <NumberField
                      label="ディゾルブ In"
                      value={selectedClip.transitionIn?.duration ?? 0}
                      step={0.05}
                      onChange={(v) => onClip({ transitionIn: v > 0 ? { kind: 'dissolve', duration: Math.min(selectedClip.duration, Math.max(0, v)) } : undefined })}
                    />
                    <NumberField
                      label="ディゾルブ Out"
                      value={selectedClip.transitionOut?.duration ?? 0}
                      step={0.05}
                      onChange={(v) => onClip({ transitionOut: v > 0 ? { kind: 'dissolve', duration: Math.min(selectedClip.duration, Math.max(0, v)) } : undefined })}
                    />
                  </div>
                  <div className="infoCard">重なったクリップ同士ではクロスディゾルブとして動作し、単独部分では背景へのフェードになります。</div>
                </>
              )}
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

          <ProjectTemplatesPanel project={project} onApply={onProject} />
          <ProjectExportSettingsPanel project={project} timelineTime={timelineTime} onChange={(exportSettings) => onProject({ exportSettings })} />
          <SubtitleExchangePanel project={project} onProject={onProject} />

          <h3 className="sectionTitleRow"><span>トラック</span><span className="trackCount">{project.tracks.length}</span></h3>
          <div className="trackAddGrid">
            {(['video', 'audio', 'overlay', 'subtitle'] as TrackKind[]).map((kind) => (
              <button type="button" key={kind} onClick={() => createTrack(kind)}><Plus size={11} />{trackKindLabel(kind)}</button>
            ))}
          </div>
          <div className="trackManagerList">
            {project.tracks.map((track, index) => {
              const removable = canRemoveTrack(project, track.id);
              return (
                <div className="trackManagerRow" key={track.id}>
                  <span className={`trackKindBadge ${track.kind}`}>{trackKindShort(track.kind)}</span>
                  <input value={track.name} onChange={(e) => changeTrackName(track.id, e.target.value)} aria-label={`${track.name}の名前`} />
                  {(track.kind === 'audio' || track.kind === 'video') && (
                    <button type="button" className={`trackToggleBtn ${track.solo ? 'active' : ''}`} onClick={() => toggleTrackSolo(track.id, !track.solo)} title="Solo">S</button>
                  )}
                  {track.kind !== 'audio' && (
                    <button type="button" className={`trackToggleBtn ${track.visible === false ? '' : 'active'}`} onClick={() => toggleTrackVisible(track.id, track.visible === false)} title="表示">V</button>
                  )}
                  <button type="button" className="miniBtn" disabled={index === 0} onClick={() => shiftTrack(track.id, -1)} title="上へ"><ChevronUp size={12} /></button>
                  <button type="button" className="miniBtn" disabled={index === project.tracks.length - 1} onClick={() => shiftTrack(track.id, 1)} title="下へ"><ChevronDown size={12} /></button>
                  <button type="button" className="miniBtn danger" disabled={!removable.allowed} onClick={() => deleteTrack(track.id)} title={removable.allowed ? '空トラックを削除' : removalReason(removable.reason)}><Trash2 size={12} /></button>
                </div>
              );
            })}
          </div>

          <h3>書き出し範囲</h3>
          <div className="twoFields">
            <NumberField label="In" value={inPoint} step={1 / Math.max(1, project.fps)} onChange={setInPoint} />
            <NumberField label="Out" value={outPoint} step={1 / Math.max(1, project.fps)} onChange={setOutPoint} />
          </div>
          <div className="projectActionGrid">
            <button type="button" onClick={() => setInPoint(timelineTime)}>現在位置を In</button>
            <button type="button" onClick={() => setOutPoint(timelineTime)}>現在位置を Out</button>
            <button type="button" onClick={() => onProject({ inPoint: undefined, outPoint: undefined })}>全範囲</button>
          </div>
          <div className="infoCard">最終書き出しは {formatSeconds(inPoint)} ～ {formatSeconds(outPoint)}（{formatSeconds(outPoint - inPoint)}）です。</div>

          <h3 className="sectionTitleRow"><span>マーカー</span><button type="button" className="miniBtn" onClick={addMarker} title="現在位置にマーカーを追加"><Flag size={12} /></button></h3>
          {markers.length === 0 && <div className="markerEmpty">マーカーなし</div>}
          <div className="markerList">
            {markers.map((marker) => (
              <div className="markerRow" key={marker.id}>
                <input
                  className="markerColor"
                  type="color"
                  value={safeColor(marker.color, '#ffc86b')}
                  onChange={(e) => patchMarker(marker.id, { color: e.target.value })}
                  aria-label={`${marker.name}の色`}
                />
                <input
                  className="markerName"
                  value={marker.name}
                  onChange={(e) => patchMarker(marker.id, { name: e.target.value })}
                  aria-label="マーカー名"
                />
                <input
                  className="markerTime"
                  type="number"
                  min={0}
                  max={project.duration}
                  step={1 / Math.max(1, project.fps)}
                  value={Number(marker.time.toFixed(3))}
                  onChange={(e) => patchMarker(marker.id, { time: Math.max(0, Math.min(project.duration, Number(e.target.value))) })}
                  aria-label={`${marker.name}の時刻`}
                />
                <button type="button" className="miniBtn danger" onClick={() => deleteMarker(marker.id)} title="マーカーを削除"><X size={12} /></button>
              </div>
            ))}
          </div>

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
  if (value && /^#[0-9a-f]{6}$/i.test(value)) return value;
  const match = value?.match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,[^)]*)?\)$/i);
  if (!match) return fallback;
  const channels = match.slice(1, 4).map((channel) => Math.max(0, Math.min(255, Number(channel))));
  return `#${channels.map((channel) => Math.round(channel).toString(16).padStart(2, '0')).join('')}`;
}

function asString(value: unknown) {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function formatSeconds(value: number) {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const minutes = Math.floor(safe / 60);
  const seconds = safe - minutes * 60;
  return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(2).padStart(5, '0')}`;
}

function trackKindLabel(kind: TrackKind) {
  if (kind === 'video') return 'ビデオ';
  if (kind === 'audio') return '音声';
  if (kind === 'subtitle') return '字幕';
  return 'オーバーレイ';
}

function trackKindShort(kind: TrackKind) {
  if (kind === 'video') return 'V';
  if (kind === 'audio') return 'A';
  if (kind === 'subtitle') return 'S';
  return 'O';
}

function removalReason(reason: 'not-found' | 'not-empty' | 'last-of-kind' | undefined) {
  if (reason === 'not-empty') return 'クリップがあるトラックは削除できません';
  if (reason === 'last-of-kind') return '同じ種類の最後のトラックは削除できません';
  return '削除できません';
}

function defaultsForGenerator(kind: GeneratorPayload['kind']): GeneratorPayload['data'] {
  if (kind === 'gradient') return { startColor: '#161b22', endColor: '#5fd8ff', angle: 0 };
  if (kind === 'noise') return { speed: 8 };
  if (kind === 'color') return { color: '#202830' };
  return undefined;
}
