# Roadmap

## Phase 0 — Foundation

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
- [ ] undo / redo command system
- [ ] multiple project launcher
- [ ] crash recovery snapshots
- [ ] keyboard shortcut manager

## Phase 1 — Practical Editing Core

- [ ] left / right trim
- [ ] split at playhead
- [ ] ripple delete
- [ ] snapping
- [ ] multi-select
- [ ] copy / paste / duplicate
- [ ] track add / remove / reorder
- [ ] transitions
- [ ] text / subtitles / shapes
- [ ] keyframes
- [ ] crop / anchor point
- [ ] speed / reverse / freeze frame
- [ ] clip grouping / compound clips
- [ ] marker system
- [ ] waveform display
- [ ] thumbnails on video clips

## Phase 2 — High Performance Media Engine

- [ ] demux layer
- [ ] WebCodecs video decoder
- [ ] WebCodecs audio decoder
- [ ] decode workers
- [ ] frame cache
- [ ] proxy generation
- [ ] OffscreenCanvas compositor
- [ ] WebGPU compositor
- [ ] WebGL2 fallback
- [ ] frame-accurate playback
- [ ] dropped-frame diagnostics

## Phase 3 — Export

- [ ] offline render graph
- [ ] WebCodecs encoder
- [ ] MP4 muxer
- [ ] WebM muxer
- [ ] H.264
- [ ] VP9
- [ ] AV1 where supported
- [ ] transparent WebM
- [ ] WAV / audio-only
- [ ] bitrate / quality presets
- [ ] 720p / 1080p / 1440p / 4K presets
- [ ] hardware encoder capability test
- [ ] render queue

## Phase 4 — Audio

- [ ] waveform cache
- [ ] gain / pan
- [ ] fade handles
- [ ] EQ
- [ ] compressor
- [ ] limiter
- [ ] noise suppression
- [ ] loudness meter
- [ ] automatic ducking
- [ ] VOICEVOX-oriented voice presets

## Phase 5 — Effects / Color

- [ ] brightness / contrast / saturation
- [ ] curves
- [ ] white balance
- [ ] LUT
- [ ] blur / sharpen
- [ ] vignette
- [ ] chroma key
- [ ] masks
- [ ] blend modes
- [ ] motion blur
- [ ] stabilization research
- [ ] reusable effect presets

## Phase 6 — Zundamon / Yukkuri Workflow

- [x] audio-volume-based mouth states
- [x] blink
- [x] bob animation
- [ ] direct PSD/ZIP import
- [ ] PSD layer parser
- [ ] character preset storage
- [ ] VOICEVOX timing import
- [ ] vowel-aware あいうえお mouth shapes
- [ ] emotion / expression automation
- [ ] subtitle auto-placement from text
- [ ] per-line expression controls
- [ ] batch generate clips from narration files
- [ ] credit-template generator

## Phase 7 — Quality of Life

- [ ] autosave history
- [ ] project templates
- [ ] reusable asset bins
- [ ] favorite effects
- [ ] search everything
- [ ] customizable workspace
- [ ] shortcut customization
- [ ] fullscreen preview
- [ ] PWA install
- [ ] offline mode
- [ ] file-system folder import where available

## Definition of usable

1. 30分以上の1080pプロジェクトを安定編集できる
2. 数GB級素材をブラウザメモリへ丸ごと載せない
3. ブラウザ再読み込み後に素材とタイムラインが復元される
4. 30/60fpsで実用的なプレビュー
5. 1080p MP4を書き出せる
6. Undo / Redoで編集事故を戻せる
7. 音ズレしない
8. 長時間書き出しでメモリリークしない
