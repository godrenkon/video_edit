# Suiram Video Edit

ブラウザだけで動く、高性能な個人用ノンリニア動画編集環境を目指すプロジェクトです。Adobe Premiere Pro / DaVinci Resolve / Final Cut Pro / Avid / YMM4 等の有用なワークフローを調査し、Chrome + AWS Amplify Hosting で一つの編集環境に統合することを長期目標にしています。

> 現在: **v0.2 research-driven foundation**。v0.1の素材管理・タイムライン・プレビュー・ずんだもん機能に加え、Undo/Redo、v2プロジェクトスキーマ、復旧snapshot、分割・リップル削除・スナップ、エフェクト/キーフレーム共通モデル、CIまで実装を進めています。

## v0.2で実装済み

### 基盤 / 安全性

- Vite + React + TypeScript
- AWS Amplify Hosting設定
- OPFSへの動画 / 音声 / 画像素材保存
- プロジェクト自動保存
- 8世代の循環OPFS recovery snapshot
- v1プロジェクトからv2へのschema migration
- Undo / Redo履歴
- ドラッグ/スライダー操作の履歴coalescing
- TypeScript typecheck + production buildのGitHub Actions CI

### タイムライン

- 複数トラック
- クリップ配置 / 移動
- 右端トリム
- 再生ヘッド位置で分割
- リップル削除
- frame単位quantize
- 再生ヘッド / marker / 他clip端へのsnapping
- 1frame nudge
- トラックmute / lock
- keyboard shortcuts
  - `Ctrl/Cmd + Z` Undo
  - `Ctrl/Cmd + Shift + Z` / `Ctrl/Cmd + Y` Redo
  - `Ctrl/Cmd + K` 分割
  - `Shift + Delete` リップル削除
  - `Alt + ← / →` 1frame移動
  - `Space` 再生/一時停止

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

現時点では**descriptor/data model段階**であり、上記の全effectが映像へ実レンダリングされる段階ではありません。実レンダリングはWebGPU / WebGL2 / Canvas / Web Audio系backendへ順次接続します。

### ずんだもん / VOICEVOX

- 口閉じ / 半開き / 開き / 瞬きPNG
- VOICEVOX等の音声をブラウザ内でRMS解析
- 3段階自動口パク
- 自動瞬き
- 上下のbob animation
- 音声clip + 立ち絵clipの自動タイムライン配置
- 将来の「あいうえお口パク」用vowel cue schema

## 調査成果 / 設計資料

2026年時点の主要編集ソフトを調査し、単なる機能名一覧ではなく、優先度・難易度・依存関係・Web API制約まで実装仕様へ変換しています。

- `docs/RESEARCH_2026.md` — Premiere / Resolve / Final Cut / Avid / VEGAS / Kdenlive / Shotcut / OpenShot / Blender / Descript / Runway / YMM4 等の調査
- `docs/FEATURE_MATRIX_V2.md` — 機能ごとの参考ソフト、Priority、Difficulty、Web実装方式
- `docs/IMPLEMENTATION_PLAN_V2.md` — Stage 0〜12の具体的実装計画、Acceptance条件、performance budget
- `docs/ARCHITECTURE.md` — エンジン構造
- `docs/ROADMAP.md` — 現在の実装状況と今後の工程
- `docs/FEATURES.md` — 高機能編集ソフトとして必要な機能一覧
- `docs/ZUNDAMON.md` — ずんだもん自動化仕様

## 重要: まだ未実装の中核機能

**完成動画のMP4 / WebM書き出しは、まだ未実装です。** 現在の「プロジェクトを書き出し」は `.sveproj.json` のバックアップであり、動画レンダリングではありません。

本番動画出力は、プレビュー画面録画ではなく次のoffline render pipelineとして実装します。

```text
Timeline
 -> source decode
 -> effects / composite
 -> VideoEncoder
 -> offline audio mix
 -> AudioEncoder
 -> MP4 / WebM muxer
 -> output
```

また、WebCodecs Worker再生、proxy、waveform/thumbnail cache、GPU compositor、AudioWorklet mixer、PSD/ZIP直接読み込み等も今後の工程です。

## 目標アーキテクチャ

```text
UI / React
  ├─ Project + Undo/Redo
  ├─ Timeline Operations
  ├─ Media Library
  └─ Inspector / Tools

Workers
  ├─ Demux / Decode (WebCodecs)
  ├─ Proxy / Thumbnail / Waveform
  ├─ Cache / OPFS
  └─ Offline Render

Render
  ├─ WebGPU
  ├─ WebGL2 fallback
  └─ Canvas fallback

Audio
  ├─ Web Audio
  └─ AudioWorklet DSP
```

WebGPUは高速化経路として利用しますが、非対応環境でも基本編集できるようWebGL2 / Canvas fallbackを残します。大容量素材は原則ブラウザ内OPFSに保存し、S3/Lambdaへ素材そのものをアップロードしない構成を基本とします。

## 開発

Node.js 22.12以上を使用します。

```bash
npm install
npm run dev
```

検証:

```bash
npm run typecheck
npm run build
# または
npm run check
```

## Amplify Hosting

このリポジトリをAmplifyへ接続すると `amplify.yml` を利用します。

- Node.js 22
- build: `npm run build`
- artifact: `dist`
- 静的配信を基本とする
- 素材はOPFSへローカル保存
- `customHttp.yml` でSharedArrayBuffer / WASM multi-threadを見据えたheaderを設定

## Definition of usable

Suiram Video Editを「完成」と呼ぶ最低ラインは以下です。

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
