# Implementation Plan V2

この計画は `docs/RESEARCH_2026.md` と `docs/FEATURE_MATRIX_V2.md` を実装順へ落としたもの。

目標は「ブラウザで動くデモ」ではなく、30分以上の1080p編集を安定して行い、素材管理から編集・字幕・音声・ずんだもん・カラー・VFX・完成動画出力まで一つのWebアプリで完結すること。

## 設計原則

1. UIスレッドをデコード・エンコード・波形解析・重いエフェクトで塞がない。
2. React stateにはProject metadataだけを置き、Blob/VideoFrame/AudioData/raw PCMを保持しない。
3. OPFSの`/cache`は消えても再生成できる。
4. すべての破壊的編集はUndo/Redo可能にする。
5. プレビューエンジンと最終レンダリングエンジンを分離する。
6. WebGPUは高速化経路であり必須要件にしない。WebGL2/Canvas fallbackを残す。
7. コーデック/ハードウェア機能は起動時・書き出し時にcapability probeする。
8. `Project` schemaはversioned migrationを通す。

---

# Stage 0 — Reliability Core

最優先。ここが弱い状態で機能を増やさない。

## 実装

- Undo / Redo history
- history coalescing for drag/slider operations
- deterministic editing commands
- project schema migration
- rotating autosave snapshots
- crash marker / clean shutdown marker
- recovery UI
- keyboard shortcut registry
- immutable-ish editor operations
- unit tests for timeline operations
- CI build/typecheck

## Acceptance

- 100回以上のUndo/Redoを連続実行して破損しない
- ブラウザ強制終了後に最後のautosaveを復元できる
- 旧version projectを自動migrationできる
- historyにmedia Blobやdecoded frameを保持しない

---

# Stage 1 — Practical Timeline

## 実装順

1. split at playhead
2. left/right trim
3. ripple delete
4. snapping
5. multi-select
6. copy/paste/duplicate
7. frame nudge
8. track add/remove/reorder
9. markers + in/out
10. ripple trim
11. roll
12. slip
13. slide
14. insert/overwrite/lift/extract
15. grouping
16. nested/compound sequence

## Architecture

タイムライン操作は以下のようなpure operationとして切り離す。

```text
editSplit(project, clipId, time) -> Project
editRippleDelete(project, selection) -> Project
editRoll(project, leftClipId, rightClipId, delta) -> Project
```

UIはpointer eventを編集量へ変換するだけにする。

## Acceptance

- 全操作をframe単位へsnap可能
- 主要操作がUndo/Redo対象
- locked trackを変更しない
- ripple操作後に負のstart/durationを作らない

---

# Stage 2 — Asset / Cache / Proxy

## OPFS layout

```text
/assets/original/*
/cache/proxy/*
/cache/thumbs/*
/cache/waveforms/*
/cache/analysis/*
/projects/<id>/project.json
/projects/<id>/snapshots/*
/presets/*
```

## 実装

- fingerprint/hash
- relink
- thumbnail extraction
- waveform generation
- 360p/540p/720p proxy
- proxy/original switch
- cache index
- LRU cache cleanup
- persistent storage status UI

## Acceptance

- 数GB素材をArrayBufferで一括読込しない
- cache全削除後もprojectが開く
- final exportはoriginalを参照

---

# Stage 3 — WebCodecs Playback Engine

## Worker split

- demux worker
- video decode worker
- audio decode worker
- cache/storage worker
- compositor worker where supported

## Pipeline

```text
OPFS/asset
 -> demux
 -> EncodedVideoChunk / EncodedAudioChunk
 -> VideoDecoder / AudioDecoder
 -> bounded frame/audio cache
 -> compositor / audio engine
```

## Preview quality

- Full
- 1/2
- 1/4
- Auto

## Acceptance

- 1080p 30fps標準素材を安定再生
- 1080p 60fpsは対応端末で実用再生
- seek時に全動画を再デコードしない
- frame cacheに明確なmemory ceiling
- dropped frame / decode latencyを診断表示

---

# Stage 4 — Compositor / Effects / Keyframes

## Renderer abstraction

```text
Renderer
  WebGPURenderer
  WebGL2Renderer
  Canvas2DRenderer
```

同じrender graphを異なるbackendで実行する。

## Effect graph

各clip:

```text
source
 -> crop/transform
 -> clip effects[]
 -> masks
 -> opacity/blend
 -> timeline composite
```

## P1 effects

- brightness / contrast
- exposure
- saturation
- temperature / tint
- curves / levels
- LUT
- blur
- sharpen
- vignette
- chroma key + spill
- drop shadow
- blend modes

## Keyframes

- hold
- linear
- cubic bezier
- copy/paste
- value graph
- speed graph later

## Acceptance

- previewとoffline renderが同一parameter modelを使う
- backend変更でProject JSONが変わらない
- WebGPUなしでも基本編集可能

---

# Stage 5 — Audio Engine

## Graph

```text
clip source
 -> clip gain/fade
 -> clip FX
 -> track bus
 -> track FX
 -> master bus
 -> output / offline mixdown
```

## P1

- waveform
- gain
- pan
- fades
- mute/solo
- mixer
- EQ
- compressor
- limiter
- ducking
- loudness meter

## P2

- gate
- expander
- de-esser
- noise reduction
- bus/send routing
- automation lanes

AudioWorkletへカスタムDSPを移す。

## Acceptance

- previewとexportのgain計算が一致
- 長時間でA/V driftが増えない
- clippingをmaster meterで検出

---

# Stage 6 — Offline Render / Export

最重要の完成条件。

## Pipeline

```text
Timeline traversal
 -> source decode
 -> effect/composite frame
 -> VideoEncoder
 -> audio offline mix
 -> AudioEncoder
 -> muxer
 -> OPFS/temp output
 -> user download/save
```

## Targets

- MP4 H.264 + audio
- WebM VP9 + Opus
- AV1 where available
- WAV
- PNG frame/sequence
- transparent WebM where supported

## Render queue

Job fields:

- project snapshot
- range
- preset
- status
- progress
- estimated frames
- error

## Acceptance

- 1080p MP4を正常生成
- frame countがproject fps/timeから決定的
- preview fpsに依存しない
- 30分出力でA/V同期が崩れない
- 長時間renderでmemoryが単調増加しない

---

# Stage 7 — Text / Subtitle / Transcript

## Text

- text clip
- fill/stroke/shadow/background
- alignment
- safe area
- reusable style preset
- lower thirds

## Subtitle

- subtitle track
- SRT import/export
- VTT import/export
- auto wrap
- speaker style
- word timing
- karaoke/word highlight

## Transcript

```text
TranscriptDocument
  speakers[]
  words[] { text, start, end, speakerId, confidence }
```

Transcriptはタイムラインclipの副産物ではなく独立データにする。

## Text-based editing

Transcript上の範囲削除 -> timeline command生成 -> ripple edit。

---

# Stage 8 — Color / Mask / Tracking

## Color

- lift/gamma/gain
- shadows/mids/highlights
- RGB curves
- hue curves
- LUT chain
- histogram
- waveform
- vectorscope
- RGB parade

ScopesはWorker/WebGPUで計算。

## Masks

- rect
- ellipse
- pen
- feather
- expansion
- invert
- keyframes

## Tracking

- point tracker
- later planar tracker
- optional object AI tracking

---

# Stage 9 — Multicam

Proxy基盤完成後に実装。

- timecode sync
- waveform correlation sync
- manual sync marker
- angle viewer
- keyboard angle cuts
- change angle after edit
- audio follows video / fixed audio

同時decoder数を抑えるためproxyを強制/推奨する。

---

# Stage 10 — Zundamon / YMM4 Replacement

このStageは一般NLEと並行して優先してよい。

## Import

- PSD import
- ZIP import
- layer tree
- eye/mouth/eyebrow/arm/expression grouping
- character preset save

## Speech

- VOICEVOX timing adapter
- vowel cues A/I/U/E/O
- fallback audio analysis
- blink
- body breathing/bob
- speaking animation

## Narration workflow

```text
narration text/audio
 -> timing
 -> character clip
 -> mouth/expression cues
 -> subtitle cues
 -> timeline assembly
```

## Batch mode

複数音声・台本から連続clip生成。

## Acceptance

- 対応PSD/ZIPをドラッグしてpreset作成
- VOICEVOX音声投入から字幕+口パクclipまで数操作
- 素材本体をGitHub/Amplifyへuploadしない

---

# Stage 11 — AI Assistance

ローカル/任意機能として追加。

## P1 low-cost analysis

- silence detect
- VAD
- beat detect
- scene detect
- transcript search
- auto chapters

## P2

- auto reframe
- subject tracking
- speech enhancement
- background segmentation

## P3

- object removal
- generative extend
- generated B-roll
- eye-contact correction

大きいモデルは端末能力に応じてWebGPU/local model/optional external serviceを切り替える。

---

# Stage 12 — Extensibility

Plugin contracts:

```text
EffectPlugin
GeneratorPlugin
ImporterPlugin
ExporterPlugin
AnalysisPlugin
CharacterPlugin
AutomationPlugin
```

最初は任意JavaScript実行を許可しない。manifest + declarative parameters + shader/WASM sandboxから開始する。

---

# Performance budgets

## Runtime

- main-thread long task: 50ms超を極力発生させない
- decoded video cache: configurable upper bound
- thumbnail/waveform generation: background worker
- timeline DOM: viewport virtualization
- media read: chunk/range based

## Practical target

- 30分以上のtimeline
- hundreds of clips
- multi-GB source media
- 1080p preview practical on normal modern hardware
- lower preview resolution on weak hardware

## Reliability target

- autosave never blocks playback
- project JSON always serializable
- cache can be rebuilt
- migration tested for every schema version
- offline render deterministic

---

# Immediate work order

1. Finish history/command tests and recovery snapshots
2. Split/ripple/snapping/multi-select
3. Thumbnail/waveform/proxy infrastructure
4. Worker demux + WebCodecs decode
5. Basic WebGPU/WebGL compositor
6. Audio mixer
7. Frame-accurate MP4/WebM export
8. Text/subtitle
9. PSD/VOICEVOX v2 workflow
10. Color/mask/tracking/multicam

完成動画を書き出せるまでは、AI生成機能より編集エンジンとexportを優先する。
