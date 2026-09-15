# Video Editor Research 2026

調査日: 2026-09-16

この文書は Suiram Video Edit を「ブラウザだけで完結する個人用の本格NLE（Non-Linear Editor）」へ育てるため、主要な編集ソフト・VFX・音声編集・字幕/文字起こし・AI編集の機能を整理したもの。

## 調査した主な製品

- Adobe Premiere Pro
- Adobe After Effects
- DaVinci Resolve / Fusion / Fairlight
- Final Cut Pro
- Avid Media Composer
- VEGAS Pro
- Kdenlive
- Shotcut
- OpenShot
- Blender Video Sequence Editor
- CapCut
- Descript
- Runway
- ゆっくりMovieMaker4 (YMM4)

## 結論

Suiram Video Edit は単に「ブラウザ版Premiere」を真似するより、次の4系統を統合するのが最も有用。

1. Premiere / Avid / Final Cut 系の高速な編集ワークフロー
2. DaVinci Resolve 系のカラー・音声・VFX統合
3. Descript / CapCut 系の文字起こし・AI補助
4. YMM4 系の音声合成・立ち絵・字幕自動化

これを一つのWebアプリに統合し、素材は原則OPFSへローカル保存、Amplifyはアプリ配信のみとする。

---

# 1. 編集・タイムライン

## 必須編集操作

Premiere / Avid / Shotcut / Kdenlive で共通して重要なのは、単純なカットだけではなく以下。

- insert / overwrite
- lift / extract
- ripple trim
- roll edit
- slip edit
- slide edit
- blade/split
- ripple delete
- trim to playhead
- extend edit
- nudge 1 frame / N frames
- snapping
- linked selection
- multi-select
- group / ungroup
- nested sequence / compound clip
- track targeting
- track lock / mute / solo / visibility
- markers / ranges / chapters
- in/out points
- J/K/L再生
- frame step

### Suiram実装方針

すべての編集操作をCommandとして実装する。UIコンポーネントから直接Project JSONを書き換えず、EditorCommandを経由する。

これにより Undo / Redo、履歴表示、クラッシュ復旧、マクロ、自動編集、AI編集が同じ基盤を使える。

---

# 2. Magnetic / Ripple Editing

Final Cut Pro の Magnetic Timeline は、クリップ移動時に不要な空白や同期崩れを避ける思想が強い。

Suiramでは完全コピーではなく、2モードを用意する。

- Free Timeline: Premiere/Resolve型。自由配置。
- Ripple Storyline: 主トラックを基準に後続クリップを自動追従。

YouTube解説動画では Ripple Storyline の方が高速に編集できる可能性が高い。

---

# 3. 文字起こしベース編集

Premiere、Avid、Descriptで特に重要。

必要機能:

- 音声→文字起こし
- 単語単位タイムコード
- 話者識別
- テキスト選択で動画範囲選択
- 文を削除すると対応部分をRipple Delete
- 「えー」「あのー」等のフィラー検出
- 無音区間検出
- 検索
- 話者別フィルター
- 字幕生成
- 章候補生成

SuiramではTranscriptをタイムラインとは別の一次データとして保存する。

```text
TranscriptDocument
  speakers[]
  words[] { start, end, text, speakerId, confidence }
```

編集はTranscriptからCommandを生成してタイムラインへ適用する。

---

# 4. マルチカム

Avidは大規模マルチカム、VEGASは多数カメラ、Premiere/Resolve/Kdenliveもマルチカムを重視している。

必要機能:

- timecode同期
- waveform同期
- 手動同期ポイント
- angle viewer
- 再生しながら数字キーでカット
- angleごとの色
- audio follows video / audio固定
- 後からangle変更

Webでは複数高解像度動画の同時デコードが重いので、proxy必須機能として扱う。

---

# 5. Proxy / Render Cache

Kdenlive、Avid、Blender、Shotcutなどで共通の重要機能。

必要機能:

- 360p / 540p / 720p proxy
- proxy自動生成
- original/proxy relink
- preview render cache
- waveform cache
- thumbnail cache
- effect result cache

最終出力は必ずoriginalを参照する。

Suiramでは `/cache` 以下を消してもプロジェクトが壊れない設計にする。

---

# 6. Keyframe / Animation

After Effects、Resolve/Fusion、Premiere、Kdenlive等に共通。

最低限:

- linear
- hold
- ease in/out
- cubic bezier
- keyframe copy/paste
- multiple parameter selection
- graph editor
- value graph
- speed graph

対象:

- position
- scale
- rotation
- opacity
- crop
- effect parameters
- audio gain/pan
- text properties
- masks

将来的にexpression相当の計算式も検討する。

---

# 7. エフェクトアーキテクチャ

各ソフトを比較すると、個別エフェクト数より「共通パラメータモデル」が重要。

EffectInstance:

```text
id
kind
enabled
parameters
keyframes
blendMode
maskRefs
```

最初に実装する映像エフェクト:

- transform
- crop
- brightness
- contrast
- exposure
- saturation
- temperature/tint
- hue
- curves
- levels
- blur
- sharpen
- vignette
- drop shadow
- chroma key
- luma key
- opacity
- blend modes

次段階:

- glow
- noise/grain
- posterize
- pixelate
- edge detect
- lens distortion
- RGB split
- motion blur
- directional blur
- displacement

---

# 8. Color

DaVinci Resolve、VEGAS、OpenShot等から採用すべきもの。

## 基本

- exposure
- contrast
- pivot
- saturation
- temperature
- tint
- lift/gamma/gain
- shadows/midtones/highlights
- RGB curves
- hue vs hue
- hue vs sat
- hue vs luma

## 管理

- input LUT
- creative LUT
- output transform
- preset保存
- scopes

## Scopes

- waveform
- RGB parade
- vectorscope
- histogram

ブラウザではscope計算をWorker/WebGPUへ逃がす。

---

# 9. Mask / Tracking / Keying

Final Cut、VEGAS、Resolve/Fusion、After Effects、Runway等の重要領域。

必要機能:

- rectangle / ellipse / pen mask
- feather
- expansion
- invert
- mask opacity
- mask keyframes
- point tracking
- planar tracking
- object tracking
- corner pin
- chroma key
- spill suppression
- garbage matte

AI人物切り抜きは後段。まず従来型マスクとtrackerを安定させる。

---

# 10. Transitions

最低限:

- cross dissolve
- dip to black/white
- wipe
- slide
- push
- zoom
- blur dissolve
- luma wipe
- audio crossfade

TransitionもEffectと同じパラメータ・キーフレーム基盤を利用する。

---

# 11. Speed / Time

- constant speed
- reverse
- freeze frame
- speed ramp
- frame blending
- optical-flow相当の補間
- preserve pitch

高品質optical flowはWebGPU/WASM/将来AIモデル候補。最初はnearest/frame blendから実装する。

---

# 12. Text / Graphics / Subtitle

必要機能:

- rich text
- font / size / weight
- fill / stroke / shadow
- background box
- alignment
- safe area
- per-character animation
- typewriter
- lower thirds
- shape layers
- SVG import
- reusable templates

字幕:

- subtitle track
- SRT/VTT/ASS import/export
- word-by-word highlight
- karaoke style
- automatic line wrapping
- speaker styles
- caption safe area

YouTube用途では字幕の読みやすさと編集速度を優先する。

---

# 13. Audio / Fairlight型機能

DaVinci Fairlight、Avid、Premiere、OpenShot等から統合する。

## Clip

- gain
- normalize
- fade
- reverse
- speed/pitch

## Track

- volume fader
- pan
- mute / solo
- bus routing
- sends

## FX

- high-pass / low-pass
- parametric EQ
- compressor
- limiter
- gate
- expander
- de-esser
- noise suppression
- hum removal
- reverb
- delay

## Automation

- track volume automation
- pan automation
- effect parameter automation
- voice ducking

Web Audio API + AudioWorkletを基盤とする。

---

# 14. Recording

- microphone recording
- screen capture
- browser tab capture
- camera capture
- countdown
- monitoring
- punch-in voiceover

MediaDevices / getDisplayMedia を利用する。

---

# 15. Export / Deliver

必要:

- MP4
- WebM
- audio WAV
- image sequence
- transparent WebM
- single-frame PNG

設定:

- resolution
- fps
- codec
- bitrate / quality
- audio bitrate
- sample rate
- range export
- background render queue

Preview録画ではなく、フレーム単位のoffline render graphで生成する。

WebCodecsはブラウザ内で低レベルのencode/decodeをWorkerから利用でき、動画編集用途に適する。Container muxingは別実装が必要。

---

# 16. Project / Media Management

- bins/folders
- tag
- rating
- favorite
- search
- smart bin
- duplicate detection
- relink
- replace footage
- metadata panel
- notes
- reusable library

個人用なのでクラウド共同編集は低優先度。

---

# 17. Backup / Recovery

Kdenlive等の自動バックアップを参考に以下を実装する。

- debounce autosave
- rotating snapshots
- crash marker
- last clean shutdown marker
- recovery dialog
- project backup export
- media never embedded in project JSON

Undo履歴とautosave履歴は別物として扱う。

---

# 18. YMM4 / VOICEVOX / ずんだもん

この領域はSuiram独自の強みになる。

YMM4ではPSD立ち絵、まばたき、VOICEVOX等が生成する口パク情報を使った「あいうえお口パク」が実装されている。

Suiramで目標とする機能:

- PSD/ZIP直接読み込み
- PSDレイヤーツリー
- 目/口/眉/腕/表情グループ認識
- character preset
- blink
- breathing/bob
- speaking-only visibility
- あ/い/う/え/お mouth shape
- VOICEVOX timing import
- audio fallback lip analysis
- sentence-level expression
- subtitle generation
- narration batch import
- credit template

PSD素材自体はリポジトリへ同梱しない。

---

# 19. AI機能

ローカルで実装可能なものから優先する。

P1:

- silence detection
- filler detection
- transcript search
- auto captions
- scene change detection
- beat detection
- auto ducking

P2:

- auto reframe
- subject tracking
- background segmentation
- speech enhancement
- smart cut

P3:

- object removal/inpainting
- generative extend
- generated B-roll
- eye contact correction

P3はモデルサイズ・GPU・コストが大きいため、WebGPU対応端末または外部サービス連携を選択式にする。

---

# 20. Plugin / Extension Architecture

Premiere/Avid/Resolve/YMM4等の長期的な強さは拡張性にある。

将来API:

- EffectPlugin
- GeneratorPlugin
- ImporterPlugin
- ExporterPlugin
- AnalysisPlugin
- AutomationPlugin
- CharacterPlugin

任意コード実行は危険なので、最初はmanifest + declarative shader/effect definition方式を優先する。

---

# Web技術上の重要制約

## WebCodecs

VideoDecoder / AudioDecoder / VideoEncoder / AudioEncoderを提供し、Dedicated Workerでも利用可能。高性能なフレーム単位処理の中核にする。

## OPFS

大容量素材・proxy・cacheの保存先。WorkerではSyncAccessHandleが利用でき、大規模なバイトアクセスに向く。一方、サイトデータ削除で消えるため、プロジェクトbackup/exportを必須にする。

## WebGPU

高速compositor・effect・scope計算に利用する。ただし2026年時点でも全ブラウザ共通のBaselineではないため、WebGL2/Canvas fallback必須。

## AudioWorklet

低遅延オーディオ処理を専用audio threadで実行できる。Mixer/EQ/compressor/meterの中核とする。

---

# 優先順位

## P0 — 編集ソフトとして壊れないこと

- Command + Undo/Redo
- crash recovery
- project migration
- deterministic timeline edits
- tests

## P0 — 長時間編集性能

- proxy
- waveform/thumbnail cache
- Worker decode
- frame cache
- timeline virtualization

## P0 — 完成動画を出せること

- offline renderer
- encode
- mux
- audio mixdown

## P1 — 毎日使う編集機能

- full trim toolset
- keyframes
- text/subtitle
- transitions
- basic color
- audio mixer

## P1 — ずんだもん/YMM4代替

- PSD direct import
- vowel lip sync
- VOICEVOX timing
- expression presets

## P2

- multicam
- scopes
- advanced color
- masks/tracking
- speed ramp
- plugin SDK

## P3

- generative AI/VFX
- advanced object removal
- high quality optical flow

---

# Primary sources

- Adobe Premiere editing: https://www.adobe.com/products/premiere/editing-and-trimming.html
- Adobe Premiere text-based editing: https://helpx.adobe.com/premiere/desktop/edit-projects/edit-video-using-text-based-editing/overview-of-text-based-editing.html
- Apple Final Cut Pro: https://www.apple.com/final-cut-pro/
- Avid Media Composer: https://www.avid.com/media-composer
- Blackmagic DaVinci Resolve Fusion: https://www.blackmagicdesign.com/products/davinciresolve/fusion
- Blackmagic DaVinci Resolve Fairlight: https://www.blackmagicdesign.com/products/davinciresolve/fairlight
- VEGAS Pro features: https://www.vegascreativesoftware.com/vegas-pro/features/
- Kdenlive features: https://kdenlive.org/features/
- Kdenlive manual: https://docs.kdenlive.org/en/getting_started/introduction.html
- Shotcut features: https://www.shotcut.org/features/
- OpenShot features: https://www.openshot.org/features/
- Blender VSE manual: https://docs.blender.org/manual/en/latest/editors/video_sequencer/
- Descript video editor: https://www.descript.com/tools/video-editor
- Runway Help: https://help.runwayml.com/
- YMM4: https://www.manjubox.net/ymm4/
- YMM4 v4.49 あいうえお口パク: https://manjubox.net/ymm4/release/4.49.0.0/
- MDN WebCodecs: https://developer.mozilla.org/en-US/docs/Web/API/WebCodecs_API
- MDN OPFS: https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system
- MDN WebGPU: https://developer.mozilla.org/en-US/docs/Web/API/WebGPU_API
- MDN AudioWorklet: https://developer.mozilla.org/en-US/docs/Web/API/AudioWorklet
