import { Bot, FileJson2, Sparkles, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { parseVoicevoxAudioQueryMouthCues } from '../core/voicevoxTiming';
import type { AssetMeta, MouthCue } from '../types/editor';

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
  const valid = closed && open && audio;

  const importVoicevoxTiming = async (file: File | null) => {
    if (!file) return;
    try {
      const result = parseVoicevoxAudioQueryMouthCues(await file.text());
      setTimingCues(result.cues);
      setTimingLabel(file.name);
      setTimingStatus(`${result.moraCount}モーラ / ${result.cues.length} cue / 約${result.estimatedDuration.toFixed(2)}秒`);
    } catch (error) {
      console.error(error);
      setTimingCues(undefined);
      setTimingLabel('');
      setTimingStatus('AudioQueryを読み込めませんでした');
    }
  };

  const clearVoicevoxTiming = () => {
    setTimingCues(undefined);
    setTimingLabel('');
    setTimingStatus('');
  };

  return (
    <section className="zundamonCard">
      <div className="zTitle"><div className="zIcon"><Bot size={18} /></div><div><strong>ずんだもん自動化</strong><span>音声解析 → 口パク + 瞬き + ふわふわ</span></div></div>
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
      })}><Sparkles size={16} />{busy ? '口パク生成中…' : '自動口パクをタイムラインに作成'}</button>
      <p>{timingCues ? 'VOICEVOX AudioQueryの母音タイミングを優先します。' : 'AudioQuery未指定時は音声を端末内で解析します。'} 画像はPSDTool等で書き出した透過PNGを素材欄に入れてください。</p>
    </section>
  );
}

function AssetSelect({ label, value, assets, onChange, wide = false }: { label: string; value: string; assets: AssetMeta[]; onChange: (v: string) => void; wide?: boolean }) {
  return <label className={wide ? 'wide' : ''}><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)}><option value="">未選択</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>;
}
