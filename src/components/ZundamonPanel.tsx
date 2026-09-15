import { Bot, Sparkles } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { AssetMeta } from '../types/editor';

export interface ZundamonRequest {
  closedAssetId: string;
  halfAssetId?: string;
  openAssetId: string;
  blinkAssetId?: string;
  audioAssetId: string;
  blinkEvery: number;
  bobAmount: number;
  bobSpeed: number;
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
  const [audio, setAudio] = useState('');
  const [blinkEvery, setBlinkEvery] = useState(4);
  const [bobAmount, setBobAmount] = useState(8);
  const [bobSpeed, setBobSpeed] = useState(0.7);
  const valid = closed && open && audio;

  return (
    <section className="zundamonCard">
      <div className="zTitle"><div className="zIcon"><Bot size={18} /></div><div><strong>ずんだもん自動化</strong><span>音声解析 → 口パク + 瞬き + ふわふわ</span></div></div>
      <div className="zGrid">
        <AssetSelect label="口閉じ *" value={closed} assets={images} onChange={setClosed} />
        <AssetSelect label="口半開き" value={half} assets={images} onChange={setHalf} />
        <AssetSelect label="口開き *" value={open} assets={images} onChange={setOpen} />
        <AssetSelect label="瞬き" value={blink} assets={images} onChange={setBlink} />
        <AssetSelect label="VOICEVOX音声 *" value={audio} assets={audios} onChange={setAudio} wide />
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
        audioAssetId: audio,
        blinkEvery,
        bobAmount,
        bobSpeed,
      })}><Sparkles size={16} />{busy ? '音声解析中…' : '自動口パクをタイムラインに作成'}</button>
      <p>画像はPSDTool等で書き出した透過PNGを素材欄に入れてください。音声解析は端末内だけで実行します。</p>
    </section>
  );
}

function AssetSelect({ label, value, assets, onChange, wide = false }: { label: string; value: string; assets: AssetMeta[]; onChange: (v: string) => void; wide?: boolean }) {
  return <label className={wide ? 'wide' : ''}><span>{label}</span><select value={value} onChange={(e) => onChange(e.target.value)}><option value="">未選択</option>{assets.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>;
}
