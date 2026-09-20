# Suiram Video Edit

> **制作作業は `main` ブランチを基準に進めます。** 最初に [`WORK_START.md`](WORK_START.md) を読み、全体設計は [`docs/MASTER_PLAN.md`](docs/MASTER_PLAN.md) を基準にしてください。古い設計書と矛盾する場合は `MASTER_PLAN.md` と現在の `main` 実装を優先します。

ブラウザだけで動く、高性能な個人用ノンリニア動画編集環境を目指すプロジェクトです。Adobe Premiere Pro / DaVinci Resolve / Final Cut Pro / Avid / YMM4 等の有用なワークフローを調査し、Chrome + AWS Amplify Hosting で一つの編集環境に統合することを長期目標にしています。

> 現在: **v0.3 production foundation**。Undo/Redo、v2 project schema、OPFS recovery、実用的なタイムライン編集、MP4/WebM/WAV/PNG出力、音声ミキサー、字幕・文字起こし、エフェクト、プロキシ、録音・画面/カメラ収録まで `main` に実装しています。重量級メディア処理は必要時だけ読み込む分割構成です。

## 現在実装済み / 整備済み

### 基盤 / 安全性

- Vite + React + TypeScript
- AWS Amplify Hosting設定
- OPFSへの動画 / 音声 / 画像素材保存
- プロジェクト自動保存
- 8世代の循環OPFS recovery snapshot
- 起動時の異常終了検知
- snapshot選択式recovery UI
- v1プロジェクトからv2へのschema migration
- Undo / Redo履歴
- ドラッグ/スライダー操作の履歴coalescing
- EditorCommand基盤
- 重量級decode / proxy / export runtimeのオンデマンド読み込み
- production buildの初期bundle容量budget検査
- PWA / offline app shell
- Vitest回帰テスト
- GitHub Actions CI: `npm test` → TypeScript check → production build
- WebCodecs / codec / OPFS / persistent storage / WebGPU / OffscreenCanvas等のbrowser capability診断

### タイムライン

- 複数トラック
- クリップ配置 / 移動
- 左右トリム / ripple trim / roll / slip / slide
- 再生ヘッド位置で分割
- リップル削除
- frame単位quantize
- 再生ヘッド / marker / 他clip端へのsnapping
- 1frame nudge
- insert / overwrite / lift / extract
- multi-select / copy / paste / duplicate / grouping
- dissolve / dip-black / slide / wipe transition
- waveform / decoded thumbnail / long timeline virtualization
- トラックmute / solo / lock / visibility / reorder
- speed / reverseを考慮する共通timeline evaluator
- keyboard shortcuts
  - `Ctrl/Cmd + Z` Undo
  - `Ctrl/Cmd + Shift + Z` / `Ctrl/Cmd + Y` Redo
  - `Ctrl/Cmd + K` 分割
  - `Shift + Delete` リップル削除
  - `Alt + ← / →` 1frame移動
  - `Space` 再生/一時停止

### Offline render / Deliver

実動画書き出し経路を実装済みです。

- realtime `canvas.captureStream()`ではなく、frame-stepped deterministic render
- ProjectとPreviewで共有するtimeline evaluation
- Mediabunnyによる必要時刻の動画frame decode
- image bitmap cache / decoder reuse / decoded sample release
- Canvas 2D compositor
  - contain配置
  - transform / anchor / rotation / opacity
  - crop
  - 対応blend mode
- H.264 + AACのMP4 video encode / mux
- VP9 / VP8 / AV1 capabilityに応じたWebM video encode
- audio trackをchunk単位でdecode / mix
- mute / solo / clip volume / speed / reverseを考慮する初期audio mixer
- Opus音声をWebMへmux
- in/out range対応
- render progress / cancellation / error reporting
- 長時間向けOPFS direct output
- OPFS非対応時のmemory output fallback
- WAV / PNG still / PNG sequence出力
- 720p / 1080p / 1440p / 4Kと品質preset
- UI上で「バックアップ」と「動画書き出し」を分離

CIではunit test / typecheck / production buildまで検証しています。長時間・多形式素材を使うbrowser fixture acceptance test、長時間A/V sync、memory leakの自動検証は今後追加します。

### 編集データモデル

将来の高度機能を後付けで破綻させないため、v2スキーマには以下を先行して入れています。

- keyframe / interpolation
- effect instance / effect parameters
- crop / anchor
- blend mode
- speed / reverse
- marker
- text / subtitle / generator clips
- subtitle word timing
- group id
- Zundamon vowel mouth cue

### エフェクト基盤

共通effect registryを追加し、parameter・keyframe・renderer backendを同じ形式で管理します。

初期descriptor:

- brightness / contrast
- exposure
- saturation
- temperature / tint
- blur
- sharpen
- vignette
- chroma key
- drop shadow
- audio gain / pan
- high-pass / low-pass
- compressor

登録済み映像effectはCanvas preview/exportで共通評価され、keyframe parity testで対応漏れを検知します。今後はLUT、scope、mask、tracking、motion blurと、WebGPU / WebGL2高速化backendを追加します。

### ずんだもん / VOICEVOX

- 口閉じ / 半開き / 開き / 瞬きPNG
- VOICEVOX等の音声をブラウザ内でRMS解析
- 3段階自動口パク
- cue実時刻に基づく口パク評価
- 自動瞬き
- 上下のbob animation
- 音声clip + 立ち絵clipの自動タイムライン配置
- VOICEVOX AudioQuery timing import
- あいうえおvowel cueと口画像割り当て
- subtitle自動配置とword highlight
- 永続character preset

## 制作開始時に読むもの

1. `WORK_START.md` — 制作開始手順と現在の次工程
2. `docs/MASTER_PLAN.md` — 現行の最上位設計・実装順
3. `docs/ROADMAP.md` — 実装状況
4. `docs/RESEARCH_2026.md` — 主要編集ソフトの調査
5. `docs/FEATURE_MATRIX_V2.md` — 機能ごとのPriority / Difficulty / Web実装方式
6. `docs/IMPLEMENTATION_PLAN_V2.md` — Stageごとの詳細実装計画
7. `docs/ARCHITECTURE.md` — 基礎エンジン構造
8. `docs/ZUNDAMON.md` — ずんだもん自動化仕様

## 重要: まだ未完成の中核機能

現在の主要な未完成領域は以下です。

- browser実機fixtureによるA/V sync・frame accuracy・長時間memory検証
- decode / render Worker化
- WebGPU compositor + WebGL fallback
- frame-accurate decoded-frame preview engine
- LUT / scope / mask / tracking / graph editor
- noise suppression / automation lane UI
- speech-to-text / automatic captions / text-based timeline editing
- multicam / compound clips / render queue / resumable render
- PSD/ZIP直接読み込みと表情・感情automation

現行export pipeline:

```text
Project / Timeline
 -> deterministic timeline evaluation
 -> Mediabunny source decode
 -> Canvas 2D composite
 -> chunked audio decode + mix
 -> WebCodecs encode
 -> MP4 + H.264/AAC or WebM + VP9/VP8/AV1/Opus mux
 -> OPFS direct output / memory fallback
 -> download
```

Previewとfinal exportは別pipelineのまま維持し、同じtimeline evaluationとeffect semanticsを共有して結果差を減らします。

## 目標アーキテクチャ

```text
UI / React
  ├─ Project + Undo/Redo / EditorCommand
  ├─ Timeline Operations
  ├─ Media Library
  └─ Inspector / Tools

Workers
  ├─ Probe / Demux / Decode (WebCodecs)
  ├─ Proxy / Thumbnail / Waveform
  ├─ Transcript / Analysis
  └─ Offline Render

Render
  ├─ WebGPU
  ├─ WebGL2 fallback
  ├─ Canvas fallback
  └─ CPU/WASM correctness fallback where required

Audio
  ├─ chunked offline mixer / Opus export
  ├─ Web Audio
  └─ AudioWorklet DSP
```

WebGPUは高速化経路として利用しますが、非対応環境でも基本編集できるようfallbackを残します。大容量素材は原則ブラウザ内OPFSに保存し、素材そのものをS3/Lambdaへ常時アップロードしないlocal-first構成を基本とします。

## 開発

Node.js 22.12以上を使用します。

```bash
npm install
npm run check
npm run dev
```

個別検証:

```bash
npm test
npm run typecheck
npm run build
```

## Amplify Hosting

このリポジトリをAmplifyへ接続すると `amplify.yml` を利用します。

- Node.js 22
- build: `npm run build`
- artifact: `dist`
- 静的配信を基本とする
- 素材・長尺render中間/出力はOPFSを優先
- `customHttp.yml` でSharedArrayBuffer / WASM multi-threadを見据えたheaderを設定

## Definition of usable

Suiram Video Editを「実用」と呼ぶ最低ラインは以下です。

1. 30分以上の1080pプロジェクトを安定編集できる
2. 数GB級素材をブラウザメモリへ丸ごと載せない
3. 再読み込み/クラッシュ後にプロジェクトを復旧できる
4. 主要編集操作をUndo / Redoできる
5. 30/60fpsで実用的なプレビュー
6. 1080p MP4をframe-accurateに書き出せる
7. 長時間でもA/V syncが崩れない
8. previewとexportでeffect結果が一致する
9. 長時間renderでmemoryが無制限に増加しない
10. Zundamon/VOICEVOX動画をYMM4に近い少ない操作数で作れる
