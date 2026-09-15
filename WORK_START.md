# Work Start Guide

This branch (`work`) is the implementation handoff point.

## Branch to use

Work on `work` unless a task explicitly needs a feature branch. Do not start implementation from `main`, `foundation-v0.1`, or `research-v0.2`.

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
- Zundamon PNG-based mouth/blink/bob prototype
- Amplify static hosting configuration
- first unit test coverage and CI on `work`

## Immediate implementation order

1. Finish reliability foundation
   - expand tests for migration, timeline operations, commands, recovery
   - keep CI green on `work`
2. Build media capability probe
   - WebCodecs codec support
   - WebGPU / OffscreenCanvas / OPFS / persistent storage checks
   - browser-specific fallback report
3. Build render-engine skeleton
   - preview clock
   - frame provider interfaces
   - worker boundaries
   - compositor abstraction
   - encoder/muxer adapters
4. Ship the first deterministic WebM export
   - frame stepping, not realtime canvas capture
   - audio included
   - progress/cancel/error reporting
5. Add proxy + relink system
6. Complete professional timeline operations
7. Upgrade Zundamon pipeline to PSD/ZIP + VOICEVOX timing
8. Add interchange formats and professional audio/color/VFX layers

## Architecture rules

- Preview and final export are separate pipelines.
- Project state contains metadata only; never store Blob, VideoFrame, AudioData, DOM nodes, GPU resources, or Object URLs in undo history.
- Long-running decode, proxy, waveform, transcript, and render work belongs in workers.
- Every editing mutation should become an EditorCommand or equivalent deterministic operation.
- Any schema change requires a migration path.
- Every new feature must define preview behavior, export behavior, undo behavior, and fallback behavior.
- Preserve local-first privacy. User media stays in browser storage unless a future cloud feature is explicitly enabled.

## Source-of-truth documents

Read these before large architectural work:
- `docs/MASTER_PLAN.md` — current production architecture and implementation order
- `docs/RESEARCH_2026.md` — researched behavior of major editors
- `docs/FEATURE_MATRIX_V2.md` — feature matrix and priorities
- `docs/IMPLEMENTATION_PLAN_V2.md` — earlier detailed implementation decomposition
- `docs/ROADMAP.md` — current roadmap/status
- `docs/ARCHITECTURE.md` — base architecture notes
- `docs/ZUNDAMON.md` — character workflow notes

When older documents conflict with `docs/MASTER_PLAN.md`, the master plan wins.

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
- README or docs are updated when behavior changes
