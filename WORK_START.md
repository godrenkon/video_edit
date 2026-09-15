# Work Start Guide

This branch (`work`) is the handoff point for the implementation phase.

## Branch to use

Work on `work` unless a task explicitly needs a feature branch. Do not start from `main` or the old `foundation-v0.1` / `research-v0.2` branches.

## First command sequence

```bash
npm install
npm run check
npm run dev
```

`npm run check` must stay green before and after each substantial change. It runs tests, TypeScript validation, and the production build.

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

## Immediate implementation order

1. Finish reliability foundation
   - expand unit tests for history, migration, timeline operations, commands, recovery
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
   - frame stepping, not canvas realtime capture
   - audio included
   - progress/cancel/error reporting
5. Add proxy + relink system
6. Complete professional timeline operations
7. Upgrade Zundamon pipeline to PSD/ZIP + VOICEVOX timing
8. Add interchange formats and pro audio/color/VFX layers

## Architecture rules

- Preview and final export are separate pipelines.
- Project state contains metadata only; never store Blob, VideoFrame, AudioData, DOM nodes, or Object URLs in undo history.
- Long-running decode, proxy, waveform, transcript, and render work belongs in workers.
- Every editing mutation should become an EditorCommand or equivalent deterministic operation.
- Any schema change requires a migration path.
- Every new feature must define preview behavior, export behavior, undo behavior, and fallback behavior.
- Preserve local-first privacy. User media stays in browser storage unless a future cloud feature is explicitly enabled.

## Source-of-truth documents

Read these before large architectural work:
- `docs/RESEARCH_2026.md`
- `docs/FEATURE_MATRIX_V2.md`
- `docs/IMPLEMENTATION_PLAN_V2.md`
- `docs/ROADMAP.md`
- `docs/ARCHITECTURE_AUDIT_2026-09-16.md`
- `docs/ULTIMATE_EDITOR_BLUEPRINT.md`
- `docs/COMPATIBILITY_PIPELINE_PLAN.md`
- `docs/IMPLEMENTATION_MASTER_PLAN.md`
- `docs/AI_AND_CHARACTER_PIPELINE.md`

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
