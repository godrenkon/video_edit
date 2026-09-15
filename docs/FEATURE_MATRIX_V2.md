# Feature Matrix V2

この表は、主要な動画編集/音声/VFX/AIツールの機能を、Suiram Video Editでどう扱うかに変換した実装マトリクス。

Priority:
- P0: 編集ソフトとして成立するため必須
- P1: 日常利用で重要
- P2: 上級機能
- P3: 重いAI/VFX・将来機能

Difficulty:
- S: 小
- M: 中
- L: 大
- XL: 非常に大

## Project / Safety

| Feature | Reference | Priority | Difficulty | Web implementation |
|---|---|---:|---:|---|
| Undo / Redo | Premiere, Resolve, YMM4, Avid | P0 | M | Command history。Project JSONのみ保存しBlob/VideoFrameは履歴に入れない |
| Autosave | Kdenlive, Resolve | P0 | S | debounce + OPFS |
| Crash recovery | Kdenlive | P0 | M | rotating snapshots + clean-shutdown marker |
| Project migration | All pro editors | P0 | M | schemaVersion + migrateProject() |
| Multiple projects | Premiere/Resolve | P1 | M | `/projects/<id>` + launcher |
| Project backup | Kdenlive/Resolve | P0 | S | `.sveproj.json` export/import |

## Media

| Feature | Reference | Priority | Difficulty | Web implementation |
|---|---|---:|---:|---|
| OPFS asset library | Web-native | P0 | M | OPFS |
| Bins/folders | Premiere/Avid/Resolve | P1 | S | metadata only |
| Tags/rating/search | Premiere/Avid | P1 | S | indexed metadata |
| Relink missing media | All | P0 | M | fingerprint + File System Access fallback |
| Proxy | Avid/Kdenlive/Shotcut/Blender | P0 | L | worker transcode, low-res cache |
| Thumbnail cache | All | P0 | M | WebCodecs -> ImageBitmap |
| Waveform cache | All | P0 | M | AudioDecoder/OfflineAudioContext |
| Scene detection | Premiere/Resolve | P2 | L | frame histogram diff worker |
| Duplicate detection | Media managers | P2 | M | hash + metadata |

## Timeline editing

| Feature | Reference | Priority | Difficulty | Notes |
|---|---|---:|---:|---|
| Move / basic trim | All | done | - | v0.1 |
| Left/right trim | All | P0 | M | frame-snapped |
| Ripple trim | Premiere/Avid/Resolve | P0 | M | Command |
| Roll edit | Premiere/Avid | P1 | M | two adjacent clips |
| Slip edit | Premiere | P1 | M | keep timeline range |
| Slide edit | Premiere | P1 | M | move clip + trim neighbors |
| Insert/overwrite | Avid/Premiere | P1 | M | source/record model |
| Lift/extract | Avid/Premiere | P1 | M | gap vs ripple |
| Split/blade | All | P0 | S | playhead split |
| Ripple delete | All | P0 | M | downstream move |
| Snapping | All | P0 | M | clips/markers/playhead |
| Multi-select | All | P0 | M | selection model |
| Group | Shotcut/Premiere | P1 | M | groupId |
| Nest/compound | Premiere/FCP/Resolve | P1 | L | nested timeline asset |
| Markers/ranges | Shotcut/Premiere | P1 | S | timeline metadata |
| In/out points | Avid/Premiere | P1 | S | source/program monitors |
| J/K/L | Avid/Premiere | P1 | S | transport state |
| Free timeline mode | Premiere/Resolve | P0 | M | default |
| Ripple storyline mode | Final Cut inspired | P2 | L | optional magnetic behavior |

## Animation

| Feature | Reference | Priority | Difficulty | Notes |
|---|---|---:|---:|---|
| Numeric keyframes | AE/Resolve/Premiere | P1 | M | shared Keyframe<T> |
| Hold/linear | all | P1 | S | first interpolation set |
| Bezier easing | AE/Resolve | P1 | M | cubic bezier |
| Graph editor | AE/Resolve | P2 | L | virtualized SVG/canvas |
| Copy/paste keyframes | all | P1 | S | serialized clipboard |
| Expressions | After Effects | P3 | XL | sandboxed expression language only |

## Text / Subtitle / Graphics

| Feature | Reference | Priority | Difficulty | Notes |
|---|---|---:|---:|---|
| Text clip | all | P1 | M | Canvas/WebGPU text layout |
| Shapes | AE/Resolve | P1 | M | rect/ellipse/path |
| Rich style | all | P1 | M | fill/stroke/shadow/background |
| Subtitle track | Premiere/Resolve/Shotcut | P1 | M | cue model |
| SRT import/export | all | P1 | S | parser/writer |
| VTT import/export | web editors | P1 | S | parser/writer |
| ASS support | Kdenlive/Shotcut | P2 | L | subset first |
| Auto captions | FCP/Kdenlive/Descript | P1 | L | transcript -> subtitle |
| Word highlight | CapCut/social tools | P2 | M | per-word cue timing |
| Lower-third templates | Premiere/Resolve | P2 | M | generator preset |

## Video effects

| Feature | Reference | Priority | Difficulty | Renderer |
|---|---|---:|---:|---|
| Transform/crop/opacity | all | P0 | M | compositor |
| Brightness/contrast | all | P1 | S | shader |
| Exposure/saturation | all | P1 | S | shader |
| Temperature/tint | Resolve/VEGAS | P1 | M | shader |
| Curves/levels | Resolve/OpenShot | P1 | M | LUT/shader |
| LUT | Resolve/VEGAS/OpenShot | P1 | M | 3D LUT |
| Blur | all | P1 | M | separable GPU blur |
| Sharpen | all | P1 | S | convolution |
| Vignette | all | P1 | S | shader |
| Drop shadow | all | P1 | M | multi-pass |
| Blend modes | all | P1 | M | compositor |
| Chroma key | all | P1 | M | shader + spill suppression |
| Luma key | VFX tools | P2 | S | shader |
| Glow | AE/Fusion | P2 | M | multi-pass |
| Grain/noise | Resolve | P2 | M | shader |
| Pixelate | all | P2 | S | shader |
| Lens distortion | Resolve/Fusion | P2 | M | shader |
| Motion blur | AE/Fusion | P2 | L | temporal samples |

## Color

| Feature | Reference | Priority | Difficulty | Notes |
|---|---|---:|---:|---|
| Lift/gamma/gain | Resolve | P2 | M | color wheels |
| Shadows/mids/highlights | Resolve | P2 | M | tonal regions |
| RGB curves | Resolve/VEGAS/OpenShot | P1 | M | LUT bake |
| Hue curves | Resolve | P2 | L | hue transforms |
| LUT chain | Resolve/VEGAS | P1 | M | input/look/output |
| Histogram | all | P1 | M | worker |
| Waveform scope | Resolve/Kdenlive | P2 | L | GPU/worker |
| Vectorscope | Resolve/Kdenlive | P2 | L | GPU/worker |
| RGB parade | Resolve/Kdenlive | P2 | L | GPU/worker |

## Mask / Tracking

| Feature | Reference | Priority | Difficulty | Notes |
|---|---|---:|---:|---|
| Rectangle/ellipse mask | AE/Fusion | P1 | M | vector mask |
| Pen mask | AE/Fusion | P2 | L | path editor |
| Feather/expand/invert | all VFX | P1 | M | signed distance or blur |
| Mask keyframes | all VFX | P2 | M | keyframe path |
| Point tracker | AE/Fusion | P2 | L | CV worker |
| Planar tracker | Fusion | P3 | XL | WASM/CV |
| Object tracking | FCP/VEGAS/OpenShot | P2 | XL | optional AI model |
| Background segmentation | FCP/Descript/Runway | P3 | XL | WebGPU/model |

## Time / Speed

| Feature | Reference | Priority | Difficulty | Notes |
|---|---|---:|---:|---|
| Constant speed | all | P1 | M | timestamp mapping |
| Reverse | all | P1 | M | decoder seek/cache |
| Freeze frame | all | P1 | S | still frame generator |
| Speed ramp | Resolve/Premiere | P2 | L | time remap curve |
| Frame blending | all | P1 | M | adjacent frame blend |
| Optical flow | FCP/Resolve | P3 | XL | GPU/WASM/AI |
| Preserve pitch | audio editors | P2 | L | WSOLA/phase vocoder |

## Audio

| Feature | Reference | Priority | Difficulty | Implementation |
|---|---|---:|---:|---|
| Gain/fades | all | P0 | S | Web Audio |
| Pan | all | P1 | S | StereoPannerNode |
| Mixer | Fairlight/Premiere | P1 | M | track/bus graph |
| EQ | Fairlight/Audition | P1 | M | Biquad filters |
| Compressor | Fairlight | P1 | M | DynamicsCompressor/custom |
| Limiter | Fairlight | P1 | M | AudioWorklet |
| Gate | Fairlight | P2 | M | AudioWorklet |
| De-esser | Fairlight | P2 | L | band detector |
| Noise suppression | Fairlight/Descript | P2 | XL | optional model |
| Ducking | Avid/Premiere | P1 | M | envelope generation |
| Loudness meter | Fairlight | P1 | L | LUFS worker/worklet |
| Bus routing | Fairlight | P2 | M | audio graph |
| Automation lanes | Fairlight | P2 | M | keyframes |

## Multicam

| Feature | Reference | Priority | Difficulty | Notes |
|---|---|---:|---:|---|
| Timecode sync | Avid/Premiere | P2 | M | metadata |
| Waveform sync | Avid | P2 | L | audio correlation |
| Multi-angle viewer | Avid/VEGAS/Kdenlive | P2 | L | proxy mandatory |
| Live angle switching | Avid/VEGAS | P2 | M | keyboard actions |
| Replace angle later | all | P2 | M | angle clip model |

## Transcript / AI-assisted editing

| Feature | Reference | Priority | Difficulty | Notes |
|---|---|---:|---:|---|
| Transcript model | Premiere/Avid/Descript | P1 | M | words + timecode |
| Text-based cut | Premiere/Descript | P2 | L | command generator |
| Silence detection | podcast editors | P1 | M | RMS/VAD |
| Filler detection | Premiere/Descript | P2 | L | transcript language model/rules |
| Search spoken words | Avid PhraseFind | P2 | M | transcript index |
| Auto chapters | Descript | P2 | M | transcript+markers |
| Auto reframe | FCP/VEGAS | P2 | XL | subject tracking |
| Smart cut | AI editors | P3 | XL | optional model |
| Generative extend | Premiere | P3 | XL | external/local AI |
| Object removal | Runway/Fusion | P3 | XL | inpainting model |

## Zundamon / YMM4 workflow

| Feature | Reference | Priority | Difficulty | Notes |
|---|---|---:|---:|---|
| RMS mouth states | current Suiram | done | - | v0.1 |
| Blink/bob | current Suiram/YMM4 | done | - | v0.1 |
| PSD direct import | YMM4 | P1 | L | PSD parser |
| ZIP import | PSD distribution flow | P1 | M | zip parser |
| Layer tree | YMM4/PSDTool | P1 | L | visibility groups |
| Character preset | YMM4 | P1 | M | OPFS JSON |
| VOICEVOX timing | YMM4 | P1 | M | timing adapter |
| A/I/U/E/O mouth | YMM4 v4.49 | P1 | M | vowel cue model |
| Audio fallback mouth analysis | YMM4 | P1 | M | phoneme/RMS fallback |
| Per-line expression | YMM4 | P1 | M | narration cue |
| Subtitle sync | YMM4 workflow | P1 | S | narration -> subtitle |
| Batch narration assembly | YMM4 | P1 | M | folder/drop batch |
| Credit preset | VOICEVOX workflow | P1 | S | project metadata/template |

## Export

| Feature | Reference | Priority | Difficulty | Notes |
|---|---|---:|---:|---|
| Offline frame render | all pro NLE | P0 | XL | worker render graph |
| WebCodecs encode | Web-native | P0 | L | capability detection |
| MP4 mux | all | P0 | L | muxer library/implementation |
| WebM mux | all | P0 | M | muxer |
| H.264 | all | P0 | M | browser support dependent |
| VP9 | web | P1 | M | WebM |
| AV1 | modern | P2 | M | support dependent |
| WAV export | audio | P1 | S | PCM writer |
| PNG sequence | pro tools | P2 | M | OPFS/user folder |
| Alpha WebM | motion graphics | P2 | L | codec support dependent |
| Render queue | Resolve/AME | P1 | M | job state machine |
| Range export | Shotcut/Premiere | P1 | S | in/out/marker range |

## Web constraints

1. WebGPU is an acceleration path, never the only renderer.
2. OPFS cache is disposable; project recovery must not depend on cache only.
3. WebCodecs does not provide container demux/mux by itself.
4. Codec availability differs by browser/OS/device; capability probing is required.
5. Dedicated Workers should own heavy decode/cache/storage work.
6. AudioWorklet should own low-latency custom audio DSP.
7. React state must never hold decoded frames, raw PCM buffers, or full media Blobs.
