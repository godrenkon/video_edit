# video_edit Master Plan

Status: production-planning source of truth for the `work` branch.

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

## 2. Non-negotiable architecture

### 2.1 Preview and export are different engines

Preview may use proxies, cache, frame dropping and aggressive shortcuts. Final export must be deterministic and step the timeline frame-by-frame. Do not use realtime canvas capture as the final production renderer.

Preview pipeline:

`asset -> proxy/original decoder -> frame cache -> compositor -> monitor`

Export pipeline:

`timeline clock -> deterministic decode -> compositor -> audio mixer -> encoder -> muxer`

### 2.2 Local media vault

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

Do not keep whole multi-GB files in JS memory.

### 2.3 Serializable project state

Project JSON stores metadata only. Never serialize runtime objects such as:

- Blob/File
- Object URL
- VideoFrame
- AudioData
- AudioBuffer
- DOM nodes
- GPU resources

Runtime objects belong in cache/worker layers and are recreated from project metadata.

### 2.4 Command-based editing

All destructive timeline/property mutations should be represented as deterministic commands or equivalent pure operations. This is the base for:

- Undo/Redo
- macros
- command palette
- repeatable tests
- future AI-assisted edits
- future collaboration/event logs

### 2.5 Schema migrations are mandatory

Every project-schema change must include a migration path. Old `.sveproj.json` files must never silently become unreadable.

## 3. Workspaces

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

- deterministic WebM export first
- MP4 where codec/mux support is viable
- ffmpeg.wasm fallback path where justified
- image-sequence export
- WAV export
- SRT/VTT export
- project backup package
- OpenTimelineIO interchange
- render diagnostics

## 4. Compatibility strategy

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

P1:
- `.sveprojz`
- OTIO JSON
- EDL export
- WebM export

P2:
- FCPXML basic export
- MP4 export with WebCodecs/muxer or WASM fallback
- Kdenlive/XGES investigation

P3:
- advanced AAF/conform workflows
- richer Resolve/Premiere/FCP roundtrip helpers

## 5. Worker/thread boundaries

Main thread should contain only:

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
- audio analysis

GPU path:

- WebGPU compositor/effects when available
- WebGL/Canvas fallback
- CPU/WASM correctness fallback where needed

## 6. Performance targets

These are engineering targets, not promises:

- 1080p 30/60fps preview should remain interactive on supported hardware
- timeline interaction should not depend on rendering every clip as a DOM node
- several-GB source files must not be read entirely into memory
- frame caches must be bounded
- VideoFrame/AudioData resources must be explicitly released
- proxy generation should allow editing high-bitrate 4K footage on weaker systems
- long export jobs must not leak memory over time
- large timelines should use viewport virtualization

## 7. Browser capability probe

The editor should expose a capability report at startup or diagnostics:

- OPFS support
- persistent storage state
- WebCodecs decode support
- VideoEncoder support by codec
- AudioEncoder support by codec
- WebGPU support
- OffscreenCanvas support
- SharedArrayBuffer/cross-origin isolation state
- maximum practical canvas dimensions
- supported import MIME/container set

Unsupported paths must degrade gracefully rather than failing later during export.

## 8. AI architecture

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

## 9. Reliability requirements

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

## 10. Implementation order

### P0 — Reliability and rendering foundation

1. Finish reliability-v0.3
   - tests for HistoryController
   - tests for migration
   - tests for timeline operations
   - tests for EditorCommand behavior
   - tests for recovery metadata
   - CI runs test + typecheck + build
2. Capability probe
3. Render-engine skeleton
   - RenderClock
   - FrameRequest
   - MediaFrameProvider
   - AudioSegmentProvider
   - PreviewCompositor
   - OfflineRenderer
   - EncoderAdapter
   - MuxerAdapter
4. First real deterministic WebM export
   - frame stepping
   - audio included
   - progress
   - cancel
   - render log
   - memory release

### P1 — Editing workflow

1. proxy generation and relink
2. source/program monitor
3. trim/roll/slip/slide
4. insert/overwrite editing modes
5. magnetic/storyline mode
6. compound clips/nested sequences
7. transitions and handles
8. text/caption editor
9. Zundamon PSD/ZIP ingest

### P2 — Professional production layer

1. multicam
2. text-based editing
3. color scopes
4. LUT/color pipeline
5. audio mixer/buses/ducking
6. OTIO import/export
7. EDL export
8. effect preset browser
9. plugin API v1

### P3 — Advanced creation

1. node VFX workspace
2. tracking/masking
3. advanced AI command proposals
4. optional cloud/offload path
5. collaboration only after the local editor is stable

## 11. Testing policy

Every pure editing operation should have deterministic unit tests.

Minimum gates before merging substantial implementation work:

- `npm test`
- `npm run typecheck`
- `npm run build`

Features affecting final output should eventually gain fixture-based render acceptance tests. Schema changes must have migration fixtures. Browser-specific features should have capability/fallback tests.

## 12. Immediate next implementation task

Do not start by adding more random UI panels.

The next engineering sequence is:

1. finish P0 reliability tests
2. create capability-probe module and diagnostics panel
3. define render interfaces and worker messages
4. implement a frame-stepped WebM prototype
5. only then expand the visible professional editing surface

This order prevents the project from becoming a visually impressive editor that cannot reliably decode, preview, recover or export real projects.
