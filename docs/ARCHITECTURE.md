# Architecture

## 目標

長時間・高解像度素材を扱ってもUIスレッドを極力止めず、Chrome上で実用的な編集を行える構造にする。

## 主要レイヤー

### 1. UI / Editor State

React + TypeScript。UIはメディアライブラリ、プレビュー、インスペクター、タイムライン、書き出し画面に分離する。

編集操作は最終的にCommandモデルへ移行し、Undo / Redoを全操作に適用する。

### 2. Project Model

プロジェクトはJSONシリアライズ可能な状態だけを保持する。

- tracks
- clips
- transforms
- effects
- keyframes
- asset metadata
- generators（ずんだもん等）

Object URL、VideoFrame、AudioData等のランタイムオブジェクトは保存データに含めない。

### 3. Asset Storage

大容量素材はOPFSへ保存する。

- `/assets/*` 元素材
- `/cache/proxy/*` プロキシ動画
- `/cache/waveform/*` 波形キャッシュ
- `/cache/thumbs/*` サムネイル
- `/projects/*` 将来の複数プロジェクト

OPFSが利用できないブラウザは制限付きモードにする。

### 4. Decode / Playback

最終形はWebCodecsをWorker内で利用する。

1. container demux
2. VideoDecoder / AudioDecoder
3. decoded frames をframe cacheへ
4. compositorへ渡す

v0.1はHTMLMediaElementを利用してUI・データモデルを先に固めている。

### 5. Compositor

優先順位:

1. WebGPU renderer
2. WebGL2 renderer
3. Canvas2D fallback

対応予定:

- transform
- crop
- opacity
- blend modes
- masks
- chroma key
- color correction
- LUT
- blur / sharpen
- text
- shapes
- transitions

### 6. Audio Engine

Web Audio API + AudioWorklet。

- gain / pan
- fades
- EQ
- compressor
- limiter
- noise reduction
- loudness meter
- voice ducking
- waveform generation

### 7. Export Engine

本番レンダリングはプレビュー再生と分離する。

- frame-accurate timeline traversal
- OffscreenCanvas in worker
- WebCodecs VideoEncoder / AudioEncoder
- muxer
- MP4 / WebM
- H.264 / VP9 / AV1（ブラウザ対応に応じて）
- WAV / audio only

非対応コーデックはWASMベースのfallbackを用意する。

### 8. Amplify

Amplifyはアプリ配信だけを担当する。ユーザーが1人で使用する前提では、動画素材のクラウド転送を標準機能にしない。

`customHttp.yml` でCross-Origin Isolationを有効にし、SharedArrayBufferを必要とするWASM処理へ備える。

## 性能原則

- main threadで動画の全フレーム処理をしない
- BlobをReact stateへ直接保持しない
- frame cacheは上限を決める
- proxy mediaを生成できるようにする
- timeline viewport外のDOMを仮想化する
- waveform / thumbnailsはバックグラウンド生成
- 4K素材は必要に応じてpreview resolutionを落とす
- autosaveは差分 + debounce
