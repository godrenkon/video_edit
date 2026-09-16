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
- in/out range export
- OPFS direct render output with memory fallback
- export progress / cancellation / error reporting
- editor UI video export control separated from project JSON backup
- Zundamon PNG-based mouth/blink/bob prototype
- Amplify static hosting configuration
- regression tests and GitHub Actions CI on `main`

## Immediate implementation order

1. Harden the first WebM export
   - browser fixture acceptance tests
   - A/V sync tests over long durations
   - memory/resource leak checks
   - missing/unsupported media diagnostics
   - verify VP9 / VP8 / AV1 + Opus combinations on target browsers
2. Complete render semantic parity
   - text / subtitle / generator compositor
   - keyframe interpolation
   - actual effect rendering
   - Preview and Export effect parity tests
3. Move long-running media/render work off the main thread
   - decode worker boundaries
   - offline render worker
   - bounded queues and cancellation
4. Add proxy + relink system
5. Complete professional timeline operations
   - left/ripple/roll/slip/slide trim
   - insert/overwrite/lift/extract
   - multi-select/copy/paste
   - transitions and handles
6. Add MP4/H.264 + AAC delivery path
7. Upgrade Zundamon pipeline to PSD/ZIP + VOICEVOX timing
8. Add interchange formats and professional audio/color/VFX layers

## Current export boundary

The current WebM pipeline is a real frame-stepped offline renderer, not realtime screen capture:

```text
Project
 -> deterministic timeline evaluation
 -> source decode
 -> Canvas 2D compositor
 -> chunked audio mix
 -> WebCodecs encoding
 -> WebM / Opus mux
 -> OPFS direct output or memory fallback
```

Do not treat it as the final renderer yet. Browser fixture tests, full effect/text parity, MP4 and GPU composition remain required.

## Architecture rules

- Preview and final export are separate pipelines, but must share timeline/effect semantics.
- Project state contains metadata only; never store Blob, VideoFrame, AudioData, AudioBuffer, DOM nodes, GPU resources, or Object URLs in undo history.
- Long-running decode, proxy, waveform, transcript, and render work belongs in workers. Current main-thread export code is a stepping stone and should preserve worker-safe boundaries.
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
