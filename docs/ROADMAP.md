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
- [x] left trim
- [x] split at playhead
- [x] ripple delete
- [x] frame quantization
- [x] snapping to playhead / markers / clip edges
- [x] one-frame nudge
- [x] ripple trim core
- [x] ripple trim drag UI (Shift + trim handle)
- [x] roll edit core
- [x] roll edit drag UI (Alt + trim handle, adjacent cuts only)
- [x] slip edit core
- [x] bounded slip / source-offset inspector UI
- [x] slide edit core + Alt-drag UI for gapless adjacent triplets
- [x] insert / overwrite core + media-library edit mode UI
- [x] lift / extract via toolbar + Delete / Shift+Delete
- [x] multi-select with Ctrl/Cmd-click, select-all, bulk move/delete/nudge
- [x] single-clip copy / paste / duplicate UI + Ctrl/Cmd shortcuts
- [x] copy / paste / duplicate operation core with fresh nested identities
- [x] track add / remove / reorder UI
- [x] safe empty-track deletion rules
- [x] track rename / solo / visibility controls
- [ ] transitions
- [x] text / subtitles / generator creation UI
- [x] data model for text / subtitle / generator clips
- [x] initial keyframe editor UI
- [x] common keyframe/effect data model
- [x] crop UI
- [x] anchor point data model
- [x] speed / reverse source-time evaluation
- [x] speed / reverse inspector controls
- [x] freeze frame engine + Inspector UI + Preview/export parity
- [x] speed / reverse data model
- [x] clip grouping / ungrouping UI + grouped selection/move/delete
- [ ] compound clips
- [x] grouping field in clip model
- [x] marker UI
- [x] marker data model
- [x] in / out range inspector UI and timeline visualization
- [x] waveform display with source-time mapping
- [x] decoded thumbnails on video clips

## Phase 2 — High Performance Media Engine

- [x] initial demux/decode layer via Mediabunny
- [x] WebCodecs-backed video frame decode path
- [x] WebCodecs-backed audio decode path for offline mix
- [x] bounded source cache configuration
- [ ] decode workers
- [ ] proxy generation
- [ ] proxy/original relink
- [x] bounded memory + OPFS timeline thumbnail cache
- [x] OPFS + memory waveform cache
- [ ] preview render cache
- [x] OffscreenCanvas-capable Canvas 2D compositor path
- [ ] WebGPU compositor
- [ ] WebGL2 fallback
- [x] deterministic frame-aligned preview timeline clock
- [ ] frame-accurate decoded-frame playback engine
- [ ] dropped-frame / decode-latency diagnostics
- [ ] timeline virtualization for long projects

## Phase 3 — Export / Deliver

- [x] deterministic offline render clock / frame loop
- [x] project frame planning / shared timeline evaluation
- [x] source frame decoder provider
- [x] Canvas 2D compositor for current asset layers
- [x] WebCodecs-backed video encoding through Mediabunny
- [x] WebM muxer
- [x] MP4 muxer
- [x] codec capability probing including H.264 / VP9 / VP8 / AV1
- [x] VP9 export where supported
- [x] VP8 fallback where supported
- [x] AV1 export where supported
- [x] H.264 MP4 export where supported
- [x] Opus audio encode / mux where supported
- [x] AAC MP4 audio encode / mux where supported
- [x] automatic MP4 -> WebM capability fallback
- [x] chunked audio-track decode and mix
- [x] mute / solo / clip volume handling in offline audio mix
- [x] speed / reverse mapping in offline audio mix
- [x] clip fade envelope in offline audio mix
- [x] in/out range export core
- [x] OPFS direct long-form output path
- [x] memory output fallback
- [x] render progress / cancellation / error reporting
- [x] editor UI video-export control separated from project backup
- [x] sample-index-based long-form audio chunk scheduler tests
- [ ] browser fixture render acceptance tests
- [ ] encoded-file long-duration A/V sync acceptance tests
- [ ] long-render memory leak acceptance tests
- [x] text / subtitle / generator rendering in final export
- [x] core Canvas/CSS effect + keyframe parity for supported effects
- [ ] full effect / keyframe rendering parity across all registered effects
- [ ] transparent WebM where supported
- [x] WAV / audio-only chunked export with OPFS + memory fallback
- [x] PNG still export at playhead using the final compositor
- [ ] PNG image sequence
- [x] bitrate / quality preset UI
- [x] 720p / 1080p / 1440p / 4K preset UI
- [ ] hardware encoder preference / benchmark
- [ ] render queue
- [ ] resumable render recovery

> Deterministic offline export is implemented for capability-dependent MP4/H.264/AAC and WebM/VP9/VP8/AV1/Opus paths. The editor also supports deterministic chunked PCM WAV audio-only delivery. Browser fixture validation, encoded-file long-duration A/V sync tests, full effect parity, and long-render memory acceptance remain incomplete.

## Phase 4 — Audio / Fairlight-style Workflow

- [x] waveform cache
- [x] clip gain in offline export mix
- [x] clip fade in / fade out model, UI, preview envelope and offline export
- [x] pan rendering
- [ ] track mixer UI
- [x] mute / solo semantics in offline export
- [ ] bus routing
- [x] initial high-pass / low-pass rendering
- [x] compressor rendering
- [x] Inspector controls for gain / pan / high-pass / low-pass / compressor
- [x] realtime Web Audio preview graph for supported clip audio effects
- [ ] exact DSP parity tests between Web Audio preview and offline processor
- [ ] limiter
- [ ] gate / expander
- [ ] de-esser
- [ ] noise suppression
- [ ] loudness meter
- [ ] automatic ducking
- [x] effect parameter keyframe evaluation in offline audio processing
- [x] effect parameter keyframe updates in realtime Web Audio preview
- [ ] dedicated automation lanes UI
- [ ] AudioWorklet DSP layer
- [ ] VOICEVOX-oriented voice presets
- [x] audio effect descriptors for gain / pan / filters / compressor

## Phase 5 — Effects / Color / Motion

- [x] extensible effect registry / parameter descriptor model
- [x] initial descriptors: brightness/contrast, exposure, saturation, temperature/tint
- [x] initial descriptors: blur, sharpen, vignette, chroma key, drop shadow
- [x] basic transform / crop / blend-mode Canvas composition path
- [x] initial registered effect rendering: brightness/contrast, exposure, saturation, blur, drop shadow
- [x] keyframe interpolation engine
- [x] hold / linear / deterministic bezier-style interpolation
- [x] initial keyframe controls in Inspector
- [ ] graph editor
- [ ] temperature/tint rendering
- [ ] sharpen rendering
- [ ] vignette rendering
- [ ] chroma-key rendering
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
- [x] text clip UI / renderer
- [x] fill / stroke / background controls for text
- [x] text shadow control with Preview / final compositor parity
- [ ] lower-third templates
- [x] basic subtitle clip editor
- [x] final-export text/subtitle compositor
- [x] SRT import/export
- [x] VTT import/export
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
- [x] fullscreen preview
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
