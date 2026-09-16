# Roadmap

Current implementation branch: `main`.

調査・設計の詳細:

- `docs/MASTER_PLAN.md`
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
- [x] crash-session marker + recovery selection UI
- [x] TypeScript + production build CI
- [x] automated tests for timeline operations / migration / history / commands
- [x] browser capability and codec diagnostics
- [ ] deterministic EditorCommand layer for every edit
- [ ] multiple project launcher
- [ ] customizable keyboard shortcut manager

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
- [x] speed / reverse source-time evaluation
- [ ] freeze frame engine
- [x] speed / reverse data model
- [ ] clip grouping / compound clips
- [x] grouping field in clip model
- [ ] marker UI
- [x] marker data model
- [ ] waveform display
- [ ] thumbnails on video clips

## Phase 2 — High Performance Media Engine

- [x] initial demux/decode layer via Mediabunny
- [x] WebCodecs-backed video frame decode path
- [x] WebCodecs-backed audio decode path for offline mix
- [x] bounded source cache configuration
- [ ] decode workers
- [ ] proxy generation
- [ ] proxy/original relink
- [ ] thumbnail cache
- [ ] waveform cache
- [ ] preview render cache
- [x] OffscreenCanvas-capable Canvas 2D compositor path
- [ ] WebGPU compositor
- [ ] WebGL2 fallback
- [ ] frame-accurate playback engine
- [ ] dropped-frame / decode-latency diagnostics
- [ ] timeline virtualization for long projects

## Phase 3 — Export / Deliver

- [x] deterministic offline render clock / frame loop
- [x] project frame planning / shared timeline evaluation
- [x] source frame decoder provider
- [x] Canvas 2D compositor for current asset layers
- [x] WebCodecs-backed video encoding through Mediabunny
- [x] WebM muxer
- [x] codec capability probing including H.264 / VP9 / VP8 / AV1
- [x] VP9 export where supported
- [x] VP8 fallback where supported
- [x] AV1 export where supported
- [x] Opus audio encode / mux where supported
- [x] chunked audio-track decode and mix
- [x] mute / solo / clip volume handling in offline audio mix
- [x] speed / reverse mapping in offline audio mix
- [x] in/out range export
- [x] OPFS direct long-form output path
- [x] memory output fallback
- [x] render progress / cancellation / error reporting
- [x] editor UI video-export control separated from project backup
- [ ] browser fixture render acceptance tests
- [ ] long-duration A/V sync acceptance tests
- [ ] long-render memory leak acceptance tests
- [ ] text / subtitle / generator rendering in final export
- [ ] effect / keyframe rendering parity with preview
- [ ] MP4 muxer
- [ ] H.264 video export
- [ ] AAC audio export
- [ ] transparent WebM where supported
- [ ] WAV / audio-only
- [ ] PNG still / image sequence
- [ ] bitrate / quality preset UI
- [ ] 720p / 1080p / 1440p / 4K preset UI
- [ ] hardware encoder preference / benchmark
- [ ] render queue
- [ ] resumable render recovery

> 初期WebM offline exportは実装済み。現在の書き出しはframe-steppedで、対応環境ではVP9/VP8/AV1映像とOpus音声をWebMへmuxする。MP4、全effect/text parity、実機fixtureによる長時間検証は未完成。

## Phase 4 — Audio / Fairlight-style Workflow

- [ ] waveform cache
- [x] clip gain in offline export mix
- [ ] fades
- [ ] pan rendering
- [ ] track mixer UI
- [x] mute / solo semantics in offline export
- [ ] bus routing
- [ ] EQ rendering
- [ ] compressor rendering
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
- [x] basic transform / crop / blend-mode Canvas composition path
- [ ] actual registered effect rendering
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
- [ ] full blend-mode parity tests
- [ ] motion blur
- [ ] reusable effect presets

## Phase 6 — Text / Subtitle / Transcript

- [x] text/subtitle clip schema
- [x] subtitle word-timing schema
- [ ] text clip UI / renderer
- [ ] fill / stroke / shadow / background
- [ ] lower-third templates
- [ ] subtitle track editor
- [ ] final-export text/subtitle compositor
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
- [x] mouth cue evaluation by actual cue timestamps
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
- [x] recovery browser UI
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
