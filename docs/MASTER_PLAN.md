# video_edit Master Plan

Status: production architecture and implementation source of truth for the `main` branch.

## 1. Product goal

Build a browser-first, local-first, high-performance video production environment that can cover the majority of work normally split across Premiere Pro, DaVinci Resolve/Fusion/Fairlight, Final Cut Pro, Kdenlive, CapCut, Descript, YMM4 and similar tools.

The goal is not to clone every UI. The goal is to combine the strongest workflows into one consistent editor:

- professional track-based editing
- optional magnetic/storyline editing
- fast proxy-first preview
- deterministic frame-accurate export
- integrated captions/transcript editing
- practical color and audio tools
- reusable motion/VFX system
- first-class Zundamon / VOICEVOX production
- strong import/export compatibility
- robust crash recovery and project migrations

## 2. Current implementation checkpoint

The first deterministic WebM delivery path now exists on `main`.

Implemented foundation:

- OPFS media/project persistence and rotating recovery snapshots
- project schema migration and Undo/Redo history
- deterministic timeline primitives and shared Preview/Export timeline evaluation
- browser codec/storage/GPU capability diagnostics
- deterministic RenderClock and frame-stepped offline render loop
- Mediabunny-backed source demux/decode
- Canvas 2D compositor for current asset layers
- VP9 / VP8 / AV1 WebM video encoding according to browser capability
- chunked audio-track decode/mix and Opus mux
- mute / solo / clip gain / speed / reverse handling in initial offline audio mix
- in/out range export
- OPFS direct output with memory fallback
- progress, cancellation and error reporting
- editor UI video export separated from project JSON backup
- automated regression tests + TypeScript + production-build CI

This checkpoint is not the final production renderer. The following are still mandatory before export can be considered broadly production-ready:

- browser fixture render acceptance tests
- long-duration A/V sync verification
- long-render memory/resource leak verification
- text/subtitle/generator rendering parity
- registered effect + keyframe rendering parity
- MP4/H.264/AAC delivery
- browser fixture coverage for Worker-based decode/render execution
- GPU compositor and fallbacks

## 3. Non-negotiable architecture

### 3.1 Preview and export are different engines

Preview may use proxies, cache, frame dropping and aggressive shortcuts. Final export must be deterministic and step the timeline frame-by-frame. Do not use realtime canvas capture as the final production renderer.

Preview pipeline:

`asset -> proxy/original decoder -> frame cache -> compositor -> monitor`

Export pipeline:

`timeline clock -> deterministic decode -> compositor -> audio mixer -> encoder -> muxer`

Preview and Export may use different execution strategies, but they must share timeline interpretation, effect semantics and test fixtures so the rendered result does not diverge.

### 3.2 Local media vault

OPFS is the primary local storage layer. Each asset should eventually have:

- stable asset ID
- original file metadata
- content hash
- media type and duration
- codec/container information
- browser decode capability
- generated proxies
- waveform cache
- thumbnails/filmstrips
- transcript/index cache
- missing-media state
- relink information

Do not keep whole multi-GB files in JS memory. Long renders should write progressively to OPFS or another streaming/random-access target.

### 3.3 Serializable project state

Project JSON stores metadata only. Never serialize runtime objects such as:

- Blob/File
- Object URL
- VideoFrame
- AudioData
- AudioBuffer
- ImageBitmap
- DOM nodes
- GPU resources

Runtime objects belong in cache/worker layers and are recreated from project metadata.

### 3.4 Command-based editing

All destructive timeline/property mutations should be represented as deterministic commands or equivalent pure operations. This is the base for:

- Undo/Redo
- macros
- command palette
- repeatable tests
- future AI-assisted edits
- future collaboration/event logs

### 3.5 Schema migrations are mandatory

Every project-schema change must include a migration path. Old `.sveproj.json` files must never silently become unreadable.

### 3.6 Runtime resources must have explicit ownership

Every decoder, sample, bitmap, audio buffer wrapper, worker, stream target and GPU resource needs a defined owner and release path. Cancellation and errors must release the same resources as successful completion.

## 4. Workspaces

### Media / Ingest

- drag/drop import
- OPFS media vault
- folders/bins/tags
- search and filtering
- media metadata inspector
- thumbnails and filmstrips
- waveform generation
- duplicate detection
- proxy generation
- missing-media relink
- capability warning per asset

### Edit

- source/program monitor
- multi-track timeline
- optional magnetic/storyline mode
- insert/overwrite/append/replace
- split/blade
- ripple delete
- trim/roll/slip/slide
- snapping
- multi-select
- copy/paste/duplicate
- track add/remove/reorder
- markers and chapters
- nested/compound sequences
- adjustment layers
- transitions
- speed/reverse/freeze
- text/shape clips
- keyboard shortcut editor
- command palette

### Transcript / Captions

- clip transcript
- sequence transcript
- word-level timing
- edit timeline from transcript
- remove pauses/filler words
- speaker labels
- caption segmentation
- SRT/VTT import/export
- style presets
- burn-in or sidecar export

### Character / Zundamon

- current PNG fallback workflow
- PSD/ZIP import
- layer-tree parsing
- semantic layer mapping: eyes, mouth, brows, arms, body, accessories
- expression presets
- mouth-shape track
- blink automation
- breathing/idle motion
- speech-linked expression changes
- VOICEVOX timing import
- Japanese vowel mouth mapping where timing is available
- subtitle-linked character animation
- reusable character presets

### Motion / VFX

- transform/crop/anchor
- keyframes
- interpolation/easing
- mask system
- chroma/luma key
- blur/shadow/glow
- blend modes
- tracking data model
- reusable effect presets
- later node graph for advanced compositing

### Color

- per-asset color metadata
- per-sequence color settings
- Rec.709 baseline
- LUT import
- tone-mapping path for Log/HDR
- histogram
- waveform
- vectorscope
- RGB parade
- adjustment-layer grading

### Audio

- track mixer
- buses
- gain/pan automation
- EQ
- compressor
- gate
- ducking
- waveform/peak cache
- loudness analysis
- speech/music presets
- WAV mixdown

### Deliver

Current:

- deterministic WebM export
- VP9 / VP8 / AV1 capability-selected video encode
- Opus audio mux when supported
- chunked offline audio mix
- in/out range
- progress/cancel/error state
- OPFS direct long-form output

Next:

- browser fixture acceptance tests
- MP4/H.264/AAC
- image sequence / PNG still
- WAV export
- SRT/VTT export
- project backup package
- OpenTimelineIO interchange
- render diagnostics / logs
- render queue

## 5. Compatibility strategy

### Native project

Primary project file: `.sveproj.json`

Future packaged project: `.sveprojz` ZIP containing:

- `project.json`
- media manifest
- thumbnails
- waveforms
- optional proxies
- optional low-resolution preview media
- license/credit notes

### Timeline interchange

OpenTimelineIO should be the primary interchange model.

Mapping target:

- project sequence -> OTIO Timeline
- video/audio/subtitle lane -> Track
- clip -> Clip + ExternalReference
- missing media -> MissingReference
- gap -> Gap
- transition -> Transition where representable
- marker -> Marker
- speed/time changes -> TimeEffect/metadata
- editor-specific data -> `suiram.video_edit` metadata namespace

### Import/export priority

P0:

- `.sveproj.json`
- SRT/VTT
- PNG/JPEG/WebP
- WAV/audio formats supported by browser
- browser-supported MP4/WebM preview
- WebM final export

P1:

- `.sveprojz`
- OTIO JSON
- EDL export
- MP4/H.264/AAC export

P2:

- FCPXML basic export
- Kdenlive/XGES investigation

P3:

- advanced AAF/conform workflows
- richer Resolve/Premiere/FCP roundtrip helpers

## 6. Worker/thread boundaries

Main thread should eventually contain only:

- React UI
- selections
- lightweight command dispatch
- visual interaction state

Dedicated workers should handle:

- media probe
- decode queues
- proxy generation
- thumbnails
- waveform generation
- transcript analysis
- export rendering
- audio analysis / offline mix where practical

Current deterministic video export executes decode, composition, audio mixing, encode and mux inside a dedicated Worker when the required browser APIs are available. Unsupported Worker runtimes use the same renderer through an automatic main-thread fallback.

GPU path:

- WebGPU compositor/effects when available
- WebGL/Canvas fallback
- CPU/WASM correctness fallback where needed

## 7. Performance targets

These are engineering targets, not promises:

- 1080p 30/60fps preview should remain interactive on supported hardware
- timeline interaction should not depend on rendering every clip as a DOM node
- several-GB source files must not be read entirely into memory
- frame caches must be bounded
- VideoFrame/VideoSample/AudioData/ImageBitmap resources must be explicitly released
- proxy generation should allow editing high-bitrate 4K footage on weaker systems
- long export jobs must not leak memory over time
- large timelines should use viewport virtualization
- audio export should decode/mix bounded chunks rather than whole-track PCM where possible

## 8. Browser capability probe

The editor exposes a capability report covering:

- OPFS support
- persistent storage state
- storage usage/quota
- WebCodecs availability
- video decode/encode support: H.264, VP9, VP8, AV1
- audio decode/encode support: Opus, AAC
- WebGPU support
- OffscreenCanvas support
- SharedArrayBuffer/cross-origin isolation state
- common import MIME/container playback hints

Unsupported paths must degrade gracefully or fail before a long render starts rather than failing silently at finalization.

## 9. AI architecture

AI must never silently mutate a project.

Required flow:

1. analyze project
2. propose a command list
3. show a human-readable change summary
4. user accepts
5. execute as an EditorCommand batch
6. normal Undo/Redo remains available

Initial AI-assisted features:

- cut silence
- filler-word suggestions
- rough cut from transcript
- caption line-break suggestions
- B-roll marker suggestions
- title variants
- music ducking suggestions
- Zundamon expression mapping from script context

Default privacy remains local-first. Media should not leave the browser unless a future cloud feature is explicitly enabled.

## 10. Reliability requirements

Every editing feature should define:

- project representation
- preview behavior
- export behavior
- Undo/Redo behavior
- import/export mapping
- worker boundary
- GPU/CPU fallback
- error handling
- test coverage

Recovery system requirements:

- rotating project snapshots
- abnormal-session detection
- selectable recovery snapshot UI
- migration before restore
- asset relink after restore
- no large binary objects stored in history

Render reliability requirements:

- deterministic frame clock
- monotonic encoded timestamps
- bounded decode/mix caches
- explicit sample/bitmap/decoder cleanup
- cancellation from every long-running phase
- no silent audio loss
- unsupported codec check before render
- fixture-based output validation
- long-duration A/V sync validation

## 11. Implementation order from current checkpoint

### P0 — Harden current WebM renderer

1. Add browser fixture acceptance harness
2. Validate frame count / timestamps / duration
3. Validate A/V sync over long durations
4. Add memory/resource regression checks
5. Improve missing/unsupported media reporting
6. Add render diagnostics log

### P1 — Render semantic parity

1. text / subtitle / generator compositor
2. keyframe interpolation
3. registered effect rendering
4. Preview/Export parity fixtures
5. transition rendering

### P2 — Performance and media workflow

1. decode/render Worker boundaries
2. bounded frame queue/cache
3. proxy generation
4. proxy/original relink
5. thumbnails and waveforms
6. timeline virtualization

### P3 — Professional editing workflow

1. left/ripple/roll/slip/slide trim
2. insert/overwrite/lift/extract
3. multi-select / copy / paste
4. compound clips/nested sequences
5. transitions and handles
6. source/program monitor workflow

### P4 — Delivery and production layers

1. MP4/H.264/AAC
2. WAV/image sequence/captions
3. OTIO/EDL
4. color scopes/LUT pipeline
5. professional audio buses/DSP/automation
6. Zundamon PSD/ZIP + VOICEVOX timing

## 12. Testing policy

Every pure editing operation should have deterministic unit tests.

Minimum gates before merging substantial implementation work:

- `npm test`
- `npm run typecheck`
- `npm run build`

Features affecting final output require browser fixture-based render acceptance tests in addition to unit/type/build checks. Schema changes require migration fixtures. Browser-specific features require capability/fallback tests.

CI success proves the codebase compiles, typechecks and passes current automated tests; it does not by itself prove long-duration browser rendering, codec availability, A/V sync or output quality on every target device.
