# Roadmap

調査・設計の詳細:

- `docs/RESEARCH_2026.md`
- `docs/FEATURE_MATRIX_V2.md`
- `docs/IMPLEMENTATION_PLAN_V2.md`

## Phase 0 — Foundation / Reliability

- [x] Vite / React / TypeScript
- [x] Amplify build config
- [x] editor shell
- [x] OPFS asset persistence
- [x] project autosave
- [x] media library
- [x] timeline basics
- [x] preview basics
- [x] clip transform inspector
- [x] zundamon RMS lip sync generator
- [x] snapshot-based Undo / Redo history
- [x] continuous drag/slider history coalescing
- [x] project schema v1 -> v2 migration
- [x] rotating OPFS recovery snapshots
- [x] TypeScript + production build CI
- [ ] deterministic EditorCommand layer for every edit
- [ ] full crash-session marker + recovery selection UI
- [ ] multiple project launcher
- [ ] customizable keyboard shortcut manager
- [ ] automated tests for timeline operations / migration / history

## Phase 1 — Practical Editing Core

- [x] right trim
- [ ] left trim
- [x] split at playhead
- [x] ripple delete
- [x] frame quantization
- [x] snapping to playhead / markers / clip edges
- [x] one-frame nudge
- [ ] ripple trim
- [ ] roll edit
- [ ] slip edit
- [ ] slide edit
- [ ] insert / overwrite
- [ ] lift / extract
- [ ] multi-select
- [ ] copy / paste / duplicate UI
- [x] duplicate operation core
- [ ] track add / remove / reorder
- [ ] transitions
- [ ] text / subtitles / shapes UI
- [x] data model for text / subtitle / generator clips
- [ ] keyframe editor UI
- [x] common keyframe/effect data model
- [ ] crop UI
- [x] anchor point data model
- [ ] speed / reverse / freeze frame engine
- [x] speed / reverse data model
- [ ] clip grouping / compound clips
- [x] grouping field in clip model
- [ ] marker UI
- [x] marker data model
- [ ] waveform display
- [ ] thumbnails on video clips

## Phase 2 — High Performance Media Engine

- [ ] demux layer
- [ ] WebCodecs video decoder
- [ ] WebCodecs audio decoder
- [ ] decode workers
- [ ] bounded frame cache
- [ ] proxy generation
- [ ] proxy/original relink
- [ ] thumbnail cache
- [ ] waveform cache
- [ ] preview render cache
- [ ] OffscreenCanvas compositor
- [ ] WebGPU compositor
- [ ] WebGL2 fallback
- [ ] frame-accurate playback
- [ ] dropped-frame / decode-latency diagnostics
- [ ] timeline virtualization for long projects

## Phase 3 — Export / Deliver

- [ ] offline render graph
- [ ] WebCodecs encoder
- [ ] MP4 muxer
- [ ] WebM muxer
- [ ] H.264 capability probing
- [ ] VP9
- [ ] AV1 where supported
- [ ] transparent WebM where supported
- [ ] WAV / audio-only
- [ ] PNG still / image sequence
- [ ] bitrate / quality presets
- [ ] 720p / 1080p / 1440p / 4K presets
- [ ] hardware encoder capability test
- [ ] in/out range export
- [ ] render queue
- [ ] render cancellation / recovery

> 完成動画のMP4/WebMレンダリングはまだ未実装。現在の「プロジェクトを書き出し」は `.sveproj.json` バックアップであり、動画書き出しとは別機能。

## Phase 4 — Audio / Fairlight-style Workflow

- [ ] waveform cache
- [ ] clip gain / fades
- [ ] pan
- [ ] track mixer
- [ ] mute / solo
- [ ] bus routing
- [ ] EQ
- [ ] compressor
- [ ] limiter
- [ ] gate / expander
- [ ] de-esser
- [ ] noise suppression
- [ ] loudness meter
- [ ] automatic ducking
- [ ] automation lanes
- [ ] AudioWorklet DSP layer
- [ ] VOICEVOX-oriented voice presets
- [x] audio effect descriptors for gain / pan / filters / compressor

## Phase 5 — Effects / Color / Motion

- [x] extensible effect registry / parameter descriptor model
- [x] initial descriptors: brightness/contrast, exposure, saturation, temperature/tint
- [x] initial descriptors: blur, sharpen, vignette, chroma key, drop shadow
- [ ] actual GPU/Canvas effect rendering
- [ ] keyframe interpolation engine
- [ ] hold / linear / cubic-bezier interpolation
- [ ] graph editor
- [ ] curves / levels
- [ ] lift / gamma / gain
- [ ] shadows / mids / highlights
- [ ] hue curves
- [ ] LUT
- [ ] scopes: histogram / waveform / vectorscope / RGB parade
- [ ] masks: rectangle / ellipse / pen
- [ ] mask feather / expand / invert
- [ ] point tracker
- [ ] planar tracker
- [ ] blend modes rendering
- [ ] motion blur
- [ ] reusable effect presets

## Phase 6 — Text / Subtitle / Transcript

- [x] text/subtitle clip schema
- [x] subtitle word-timing schema
- [ ] text clip UI / renderer
- [ ] fill / stroke / shadow / background
- [ ] lower-third templates
- [ ] subtitle track editor
- [ ] SRT import/export
- [ ] VTT import/export
- [ ] ASS subset
- [ ] word-by-word highlight
- [ ] transcript document model
- [ ] speech-to-text adapter
- [ ] speaker detection
- [ ] text-based timeline editing
- [ ] silence / filler detection
- [ ] transcript search
- [ ] automatic captions
- [ ] auto chapters

## Phase 7 — Zundamon / YMM4 Replacement

- [x] audio-volume-based mouth states
- [x] blink
- [x] bob animation
- [x] vowel field in mouth-cue schema
- [ ] direct PSD/ZIP import
- [ ] PSD layer parser
- [ ] eye / mouth / eyebrow / arm / expression group recognition
- [ ] character preset storage
- [ ] VOICEVOX timing import
- [ ] vowel-aware あいうえお mouth shapes
- [ ] fallback phoneme/audio analysis
- [ ] emotion / expression automation
- [ ] subtitle auto-placement from narration
- [ ] per-line expression controls
- [ ] batch generate clips from narration files
- [ ] credit-template generator

## Phase 8 — Multicam

- [ ] timecode sync
- [ ] waveform correlation sync
- [ ] manual sync marker
- [ ] proxy-backed angle viewer
- [ ] keyboard angle switching while playing
- [ ] replace angle after edit
- [ ] audio follows video / fixed audio

## Phase 9 — Recording / Capture

- [ ] microphone recording
- [ ] screen / tab capture
- [ ] camera capture
- [ ] countdown
- [ ] monitoring
- [ ] punch-in voiceover

## Phase 10 — AI Assistance

### Low-cost local analysis

- [ ] silence / VAD
- [ ] beat detection
- [ ] scene-change detection
- [ ] transcript search
- [ ] automatic chapter candidates

### Advanced optional processing

- [ ] auto reframe
- [ ] subject/object tracking
- [ ] speech enhancement
- [ ] background segmentation
- [ ] object removal / inpainting
- [ ] generative extend
- [ ] generated B-roll
- [ ] eye-contact correction

Large AI models must be optional and selected according to WebGPU/device capability or an explicitly configured external service.

## Phase 11 — Quality of Life / Extension

- [x] rotating autosave snapshots
- [ ] recovery browser UI
- [ ] project templates
- [ ] reusable asset bins
- [ ] tags / rating / favorites UI
- [ ] favorite effects
- [ ] search everything
- [ ] customizable workspace
- [ ] shortcut customization
- [ ] fullscreen preview
- [ ] PWA install
- [ ] offline mode
- [ ] file-system folder import where available
- [ ] plugin contracts: Effect / Generator / Importer / Exporter / Analysis / Character / Automation

## Definition of usable

1. 30分以上の1080pプロジェクトを安定編集できる
2. 数GB級素材をブラウザメモリへ丸ごと載せない
3. ブラウザ再読み込み後に素材とタイムラインが復元される
4. 編集操作をUndo / Redoで安全に戻せる
5. 30/60fpsで実用的なプレビュー
6. 1080p MP4を書き出せる
7. previewとexportで映像/音声/エフェクト結果が一致する
8. 長時間でも音ズレしない
9. 長時間書き出しでメモリ使用量が無制限に増えない
10. Zundamon/VOICEVOX制作をYMM4に近い少ない操作数で完結できる
