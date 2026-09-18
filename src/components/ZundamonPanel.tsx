import { Bot, FileJson2, Save, Sparkles, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { parseVoicevoxAudioQueryMouthCues } from '../core/voicevoxTiming';
import { createZundamonCharacterPreset, loadZundamonCharacterPresets, normalizeZundamonPresetName, resolveZundamonCharacterPreset, saveZundamonCharacterPresets } from '../core/zundamonPresets';
import type { AssetMeta, MouthCue, SubtitlePayload } from '../types/editor';

export interface ZundamonRequest {
  closedAssetId: string;
  halfAssetId?: string;
  openAssetId: string;
  vowelAssetIds?: Partial<Record<'a' | 'i' | 'u' | 'e' | 'o', string>>;
  blinkAssetId?: string;
  audioAssetId: string;
  blinkEvery: number;
  bobAmount: number;
  bobSpeed: number;
  timingCues?: MouthCue[];
  subtitlePayload?: SubtitlePayload;
}

interface Props {
  assets: AssetMeta[];
  busy: boolean;
  onGenerate: (request: ZundamonRequest) => void;
}

export function ZundamonPanel({ assets, busy, onGenerate }: Props) {
  const images = useMemo(() => assets.filter((a) => a.kind === 'image'), [assets]);
  const audios = useMemo(() => assets.filter((a) => a.kind === 'audio'), [assets]);
  const [closed, setClosed] = useState('');
  const [half, setHalf] = useState('');
  const [open, setOpen] = useState('');
  const [blink, setBlink] = useState('');
  const [vowelA, setVowelA] = useState('');
  const [vowelI, setVowelI] = useState('');
  const [vowelU, setVowelU] = useState('');
  const [vowelE, setVowelE] = useState('');
  const [vowelO, setVowelO] = useState('');
  const [audio, setAudio] = useState('');
  const [blinkEvery, setBlinkEvery] = useState(4);
  const [bobAmount, setBobAmount] = useState(8);
  const [bobSpeed, setBobSpeed] = useState(0.7);
  const [timingCues, setTimingCues] = useState<MouthCue[] | undefined>();
  const [timingLabel, setTimingLabel] = useState('');
  const [timingStatus, setTimingStatus] = useState('');
  const [timingSubtitle, setTimingSubtitle] = useState<SubtitlePayload | undefined>();
  const [autoSubtitle, setAutoSubtitle] = useState(true);
  const [presets, setPresets] = useState(() => loadZundamonCharacterPresets());
  const [presetId, setPresetId] = useState('');
  const [presetName, setPresetName] = useState('');
  const valid = closed && open && audio;

  const importVoicevoxTiming = async (file: File | null) => {
    if (!file) return;
    try {
      const result = parseVoicevoxAudioQueryMouthCues(await file.text());
      setTimingCues(result.cues);
      setTimingSubtitle(result.text ? {
        text: result.text,
        words: result.words,
        wordHighlight: true,
        highlightColor: '#ffc928',
      } : undefined);
      setTimingLabel(file.name);
      setTimingStatus(`${result.moraCount}モーラ / ${result.cues.length} cue / 約${result.estimatedDuration.toFixed(2)}秒`);
    } catch (error) {
      console.error(error);
      setTimingCues(undefined);
      setTimingSubtitle(undefined);
      setTimingLabel('');
      setTimingStatus('AudioQueryを読み込めませんでした');
    }
  };

  const clearVoicevoxTiming = () => {
    setTimingCues(undefined);
    setTimingSubtitle(undefined);
    setTimingLabel('');
    setTimingStatus('');
  };

  const currentCharacterSelection = () => ({
    closed,
    half,
    open,
    blink,
    vowelA,
    vowelI,
    vowelU,
    vowelE,
    vowelO,
    blinkEvery,
    bobAmount,
    bobSpeed,
  });

  const commitPresets = (next: typeof presets) => {
    setPresets(next);
    saveZundamonCharacterPresets(next);
    if (presetId && !next.some((preset) => preset.id === presetId)) {
      setPresetId(next[0]?.id ?? '');
    }
  };

  const saveCharacterPreset = () => {
    const name = normalizeZundamonPresetName(presetName) || `Character ${presets.length + 1}`;
    const preset = createZundamonCharacterPreset(name, currentCharacterSelection(), assets);
    const next = [preset, ...presets].slice(0, 32);
    commitPresets(next);
    setPresetId(preset.id);
    setPresetName('');
  };

  const applyCharacterPreset = () => {
    const preset = presets.find((item) => item.id === presetId) ?? presets[0];
    if (!preset) return;
    const resolved = resolveZundamonCharacterPreset(preset, assets);
    setClosed(resolved.closed);
    setHalf(resolved.half);
    setOpen(resolved.open);
    setBlink(resolved.blink);
    setVowelA(resolved.vowelA);
    setVowelI(resolved.vowelI);
    setVowelU(resolved.vowelU);
    setVowelE(resolved.vowelE);
    setVowelO(resolved.vowelO);
    setBlinkEvery(resolved.blinkEvery);
    setBobAmount(resolved.bobAmount);
    setBobSpeed(resolved.bobSpeed);
  };

  const deleteCharacterPreset = () => {
    const selected = presets.find((item) => item.id === presetId) ?? presets[0];
    if (!selected) return;
    commitPresets(presets.filter((preset) => preset.id !== selected.id));
  };

  const selectedPreset = presets.find((preset) => preset.id === presetId) ?? presets[0] ?? null;

  return (
    <section className="zundamonCard">
      <div className="zTitle"><div className="zIcon"><Bot size={18} /></div><div><strong>ずんだもん自動化</strong><span>音声解析 → 口パク + 瞬き + ふわふわ</span></div></div>
      <div className="zPresetPanel">
        <div className="zPresetSave">
          <input value={presetName} onChange={(e) => setPresetName(e.target.value)} maxLength={80} placeholder="キャラpreset名" aria-label="キャラクタープリセット名" />
          <button type="button" onClick={saveCharacterPreset}><Save size={12} />保存</button>
        </div>
        <div className="zPresetApply">
          <select value={selectedPreset?.id ?? ''} onChange={(e) => setPresetId(e.target.value)} disabled={!presets.length} aria-label="キャラクタープリセット">
            {!presets.length && <option value="">presetなし</option>}
            {presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}
          </select>
          <button type="button" onClick={applyCharacterPreset} disabled={!selectedPreset}>適用</button>
          <button type="button" className="danger" onClick={deleteCharacterPreset} disabled={!selectedPreset} title="preset削除"><Trash2 size={12} /></button>
        </div>
      </div>
      <div className="zGrid">
        <AssetSelect label="口閉じ *" value={closed} assets={images} onChange={setClosed} />
        <AssetSelect label="口半開き" value={half} assets={images} onChange={setHalf} />
        <AssetSelect label="口開き *" value={open} assets={images} onChange={setOpen} />
        <AssetSelect label="瞬き" value={blink} assets={images} onChange={setBlink} />
        <AssetSelect label="あ口" value={vowelA} assets={images} onChange={setVowelA} />
        <AssetSelect label="い口" value={vowelI} assets={images} onChange={setVowelI} />
        <AssetSelect label="う口" value={vowelU} assets={images} onChange={setVowelU} />
        <AssetSelect label="え口" value={vowelE} assets={images} onChange={setVowelE} />
        <AssetSelect label="お口" value={vowelO} assets={images} onChange={setVowelO} />
        <AssetSelect label="VOICEVOX音声 *" value={audio} assets={audios} onChange={setAudio} wide />
      </div>
      <div className="zTimingImport">
        <label className="zTimingFile">
          <FileJson2 size={14} />
          <span>{timingLabel || 'VOICEVOX AudioQuery JSON（任意）'}</span>
          <input
            type="file"
            accept=".json,application/json"
            onChange={(e) => {
              void importVoicevoxTiming(e.target.files?.[0] ?? null);
              e.currentTarget.value = '';
            }}
          />
        </label>
        {timingCues && <button type="button" className="miniBtn" onClick={clearVoicevoxTiming} title="VOICEVOX timingを解除"><X size={13} /></button>}
        {timingStatus && <small>{timingStatus}</small>}
        {timingSubtitle && (
          <label className="zAutoSubtitle">
            <input type="checkbox" checked={autoSubtitle} onChange={(e) => setAutoSubtitle(e.target.checked)} />
            <span>AudioQuery文字列から字幕も自動作成（文字timingハイライト付き）</span>
          </label>
        )}
      </div>
      <div className="zControls">
        <label>瞬き <input type="number" min={1.5} max={10} step={0.1} value={blinkEvery} onChange={(e) => setBlinkEvery(Number(e.target.value))} /><span>秒</span></label>
        <label>上下 <input type="number" min={0} max={100} step={1} value={bobAmount} onChange={(e) => setBobAmount(Number(e.target.value))} /><span>px</span></label>
        <label>速度 <input type="number" min={0.1} max={3} step={0.1} value={bobSpeed} onChange={(e) => setBobSpeed(Number(e.target.value))} /></label>
      </div>
      <button className="button zButton" disabled={!valid || busy} onClick={() => onGenerate({
        closedAssetId: closed,
        halfAssetId: half || undefined,
        openAssetId: open,
        blinkAssetId: blink || undefined,
        vowelAssetIds: {
          ...(vowelA ? { a: vowelA } : {}),
          ...(vowelI ? { i: vowelI } : {}),
          ...(vowelU ? { u: vowelU } : {}),
          ...(vowelE ? { e: vowelE } : {}),
          ...(vowelO ? { o: vowelO } : {}),
        },
        audioAssetId: audio,
        blinkEvery,
        bobAmount,
        bobSpeed,
        timingCues,
        subtitlePayload: autoSubtitle ? timingSubtitle : undefined,
      })}><Sparkles size={16} />{busy ? '口パク生成中…' : '自動口パクをタイムラインに作成'}</button>
      <p>{timingCues ? 'VOICEVOX AudioQueryの母音タイミングを優先します。' : 'AudioQuery未指定時は音声を端末内で解析します。'} 画像はPSDTool等で書き出した透過PNGを素材欄に入れてください。</p>
    </section>
  );
}

function AssetSelect({ label, value, assets, onChange, wide = false }: { label: string; value: string; assets: AssetMeta[]; onChange: (v: string) => void; wide?: boolean }) {
  return <label className={wide ? 'wide' : ''}><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)}><option value="">未選択</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>;
}
