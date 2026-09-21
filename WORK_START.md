# Work Start Guide

`main` is the current implementation branch and production handoff point.

## Branch to use

Work directly on `main` unless a task explicitly needs an isolated feature branch. The older `work`, `foundation-v0.1`, and `research-v0.2` branches are reference/history, not the current implementation base.

## First command sequence

```bash
npm install
npm run check
npm run dev
```

`npm run check` must stay green before and after substantial changes. It runs unit tests, TypeScript validation, and the production build.

## Current foundation

Implemented already:
- React + TypeScript + Vite editor shell
- OPFS-backed media/project storage
- v2 project schema and migration path
- undo/redo history controller
- split, ripple delete, snapping, frame movement primitives
- basic effects/keyframe schema
- recovery snapshots and recovery UI
- browser capability / codec diagnostics
- deterministic RenderClock and offline frame loop
- shared Preview/Export timeline evaluation
- Mediabunny-backed video and audio source decoding
- Canvas 2D project compositor for current asset layers
- deterministic WebM video encode and mux
- chunked audio-track mix + Opus mux
- deterministic MP4 / H.264 + AAC encode and mux
- in/out range export
- OPFS direct render output with memory fallback
- export progress / cancellation / error reporting
- editor UI video export control separated from project JSON backup
- WAV / PNG still / streamed PNG sequence delivery
- proxy generation / auto relink / manual original relink
- cached waveform / decoded thumbnails / long-timeline virtualization
- lazy-loaded decode, proxy and export runtime chunks
- shared thumbnail/waveform analysis worker with cancellation and fallback
- paused/effect-preview composition worker with cancellation and fallback
- video export decode/render/worker-safe planar PCM audio-mix/encode worker with cancellation and fallback
- Zundamon PNG-based mouth/blink/bob prototype
- Amplify static hosting configuration
- regression tests and GitHub Actions CI on `main`

## Immediate implementation order

1. Harden MP4/WebM export
   - browser fixture acceptance tests
   - A/V sync tests over long durations
   - memory/resource leak checks
   - missing/unsupported media diagnostics
   - verify VP9 / VP8 / AV1 + Opus combinations on target browsers
2. Complete remaining realtime media Worker boundaries
   - frame-accurate playback decode worker
   - proxy and transcript worker boundaries
   - bounded queues, backpressure and cancellation
3. Add WebGPU compositor with WebGL2/Canvas fallbacks
4. Add LUT, scopes, masks, tracking and graph editor
5. Add speech-to-text, automatic captions and text-based editing
6. Add render queue, resumable render and browser acceptance fixtures
7. Upgrade Zundamon pipeline to PSD/ZIP import and expression automation
8. Add multicam, compound clips, interchange formats and plugin contracts

## Current export boundary

The current WebM pipeline is a real frame-stepped offline renderer, not realtime screen capture:

```text
Project
 -> deterministic timeline evaluation
 -> source decode
 -> Canvas 2D compositor
 -> chunked audio mix
 -> WebCodecs encoding
 -> MP4/H.264/AAC or WebM/VP9/VP8/AV1/Opus mux
 -> OPFS direct output or memory fallback
```

Do not treat it as the final renderer yet. Browser fixture tests, long-duration A/V sync and memory validation, and GPU composition remain required.

## Architecture rules

- Preview and final export are separate pipelines, but must share timeline/effect semantics.
- Project state contains metadata only; never store Blob, VideoFrame, AudioData, AudioBuffer, DOM nodes, GPU resources, or Object URLs in undo history.
- Long-running decode, proxy, waveform, transcript, and render work belongs in workers. Video export now uses a dedicated Worker and retains the same implementation as an unsupported-browser fallback.
- Every editing mutation should become an EditorCommand or equivalent deterministic operation.
- Any schema change requires a migration path.
- Every new feature must define preview behavior, export behavior, undo behavior, fallback behavior, and tests.
- Release decoded media/GPU/runtime resources deterministically.
- Preserve local-first privacy. User media stays in browser storage unless a future cloud feature is explicitly enabled.

## Source-of-truth documents

Read these before large architectural work:
- `docs/MASTER_PLAN.md` — current production architecture and implementation direction
- `docs/ROADMAP.md` — current implementation status
- `docs/RESEARCH_2026.md` — researched behavior of major editors
- `docs/FEATURE_MATRIX_V2.md` — feature matrix and priorities
- `docs/IMPLEMENTATION_PLAN_V2.md` — earlier detailed implementation decomposition
- `docs/ARCHITECTURE.md` — base architecture notes
- `docs/ZUNDAMON.md` — character workflow notes

When older documents conflict with `docs/MASTER_PLAN.md`, `WORK_START.md`, or current `main`, the current `main` architecture wins.

## Open Issues

- #1 Reliability / Undo / Recovery
- #2 WebCodecs + Worker playback engine
- #3 Frame-accurate MP4/WebM export engine
- #4 Professional timeline editing
- #5 Zundamon PSD/ZIP + VOICEVOX integration

## Definition of done for every implementation task

A task is not complete until:
- tests pass
- typecheck passes
- production build passes
- memory/runtime resources are released correctly
- unsupported browser paths fail gracefully
- project migration/serialization remains valid
- preview/export behavior is explicitly considered
- README or docs are updated when behavior changes
