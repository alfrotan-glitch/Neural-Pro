# System Overview

**Status:** Current-state description (as built) + target-state deltas. Verified by source
inspection and executed reproductions, not by documentation.

---

## 1. What Neural-Pro is

Neural-Pro is a **browser-based, AI-assisted media production studio** with four product
surfaces behind one SPA:

| Surface | Entry | Purpose |
|---|---|---|
| Podcast Script Studio | `src/App.tsx` (`viewMode='podcast'`) | Gemini-generated two-host podcast scripts |
| **Video Studio PRO MAX** | `src/components/VideoStudioPro.tsx` | Multi-track timeline editor + WebCodecs export |
| Subscribe Generator | `src/components/subscribe-generator/SubscribeGenerator.tsx` | YouTube subscribe-animation generator |
| Inspector | `src/components/inspector/InspectorEngine.tsx` | Per-clip property editing, captions, TTS |

The dominant surface — and the one that carries all P0/P1 risk — is **Video Studio PRO MAX**.

## 2. Scale (measured)

```
src/                 41,418 LOC  (205 .ts, 55 .tsx)
server.ts             1,311 LOC
tests/                 5,316 LOC  (173 files)
resolution-test/        664 LOC  (18 files)
scripts/                 ~200 LOC (4 files)
```

Largest modules: `TextInspectorPanel.tsx` 3,521 · `VirtualizedTimeline.tsx` 2,239 ·
`App.tsx` 1,630 · `ResourceSidebar.tsx` 1,410 · `VideoPlayer.tsx` 1,321 ·
`SubtitleRenderer.tsx` 1,057 · `useTimelineDragExecution.ts` 905 ·
`CanvasExportRenderer.ts` 803.

## 3. Runtime topology (current)

```
┌──────────────────────── BROWSER (SPA, 1.33 MB / 359 KB gzip) ───────────────────────┐
│                                                                                      │
│  Zustand stores (authoritative in-memory project state)                             │
│    useProjectStore  useHistoryStore  useExportStore  useSubscribeStore              │
│            │                                                                         │
│  TransportClock ──► (RAF) ──► useProjectStore.setCurrentTime                        │
│            │                                                                         │
│  VideoPlayer (DOM)  ◄── "PREVIEW" ── renders ONLY clips active at playhead          │
│      └── <RealVideoElement data-export-media-clip-id=…>                             │
│                          ▲                                                           │
│                          │ document.querySelectorAll  ◄── DOM SCRAPING              │
│  RenderPipeline (singleton, serialised)                                             │
│      └── VideoStudioPro useEffect([isExporting])  ◄── THE "WORKFLOW ENGINE"          │
│             ├── renderProjectAudio()  → OfflineAudioContext → AudioBuffer            │
│             ├── collectExportVideoElements()                                         │
│             ├── seekActiveVideoClips()  (imperative seeks on Preview nodes)          │
│             ├── CanvasExportRenderer  → 2D canvas @ export resolution                │
│             └── exportVideoWebCodecs() → VideoEncoder + mp4-muxer → Blob             │
└────────────────────────────────────────────────────────────────────────────────────┘
                    │  fetch /api/…                          │  fetch /api/export/…
┌───────────────────▼────────────────────────────────────────▼───────────────────────┐
│  Node/Express server (tsx, hard-coded port 3000)                                    │
│    ├── Vite dev middleware (dev) | express.static(dist) (prod)                       │
│    ├── /api/generateContent  → GoogleGenAI  ← RAW BODY FORWARDED VERBATIM            │
│    ├── /api/generate-captions, /refine-captions, /parse-srt, /export-srt → Gemini    │
│    └── /api/export/*  → /tmp/<session>/ + spawn('ffmpeg')                            │
└────────────────────────────────────────────────────────────────────────────────────┘
                    │
              Google Gemini API (generativelanguage.googleapis.com)
```

## 4. The four structural facts that drive every decision in this blueprint

### F1 — Export is a DOM parasite of Preview
`src/core/engine/render/ExportMediaRegistry.ts` collects media via
`document.querySelectorAll('[data-export-media-clip-id]')`. `VideoPlayer.tsx:497` mounts a
`<video>` **only for clips active at the current playhead**. Export sets `currentTime = 0`
and snapshots the registry once.

**Consequence (reproduced):** for the shipped default project, `v2_clip` (18.5 s) and
`v3_clip` (30.5 s) have no media element; `CanvasExportRenderer` takes its `if (!drawn)`
branch and paints a purple gradient. **795 of 1 350 frames (58.9 %) export as placeholder.**

### F2 — The parity/diagnostics subsystem is unreachable
`exportService.renderExportFrame()` — the module implementing
seek → standalone-render-snapshot → diagnostics → parity-gate → render — **has no callers**.
`VideoStudioPro.tsx:565` calls `CanvasExportRenderer.render()` directly with
`renderSnapshot: undefined`. All 19 `renderDiagnostic*` / `renderSnapshot*` modules
(2 087 LOC) are dead at runtime. Six grep-based tests assert the parity gate is "active".

### F3 — Two renderers apply the same canonical values with different semantics
Preview = CSS/DOM. Export = Canvas2D. Both consume `clipTransformModel` and
`mediaFrameGeometry`, but compose transforms as `T·S·R` vs `T·R·S` and only Preview clips
cover-scaled overflow. Both divergences are reproduced.

### F4 — There is no workflow engine
"Workflow" = `useEffect([isExporting])` (480 lines) + a `setInterval(1500)` poller in
`ExportQueueManager` + `RenderPipeline.executionTail`. Three dispatch authorities, no step
model, no checkpoints, no idempotency keys, no timeouts, no recovery.

## 5. Dependency direction (current — inverted)

```
Target:   UI  →  Application/Workflow  →  Domain/Core  →  Infrastructure

Current:  UI ──────────────────────────────┐
             ↘                              ▼
               features/*  ────────►  core/engine/*      ← INVERTED
                    ▲                      │
                    └──────────────────────┘             ← CYCLE
          server.ts ──► src/features/…/captions/…        ← SERVER → BROWSER FEATURE
```

**Verified violations:**

| # | Violation | Evidence |
|---|---|---|
| V1 | `core/engine/*` imports `features/video-studio/*` | `CanvasExportRenderer.ts:5-12` imports 6 modules from `features/.../playback/...`; `projectDuration.ts:1` imports `features/.../project/types/project` |
| V2 | Circular store dependency | `useProjectStore.executeCommand` → `useHistoryStore.addCommand`; `useHistoryStore.undo/redo` → `useProjectStore.setState` |
| V3 | Server imports browser-feature code | `server.ts:9` imports `src/features/video-studio/captions/services/captionTimecodeService` |
| V4 | Domain logic duplicated to break a cycle | `clipTimelineDuration.ts` header comment states it is "dependency-light so … Preview, Playback, Audio and Export can all use the same duration rule **without creating a feature/core import cycle**" |
| V5 | UI owns workflow semantics | `VideoStudioPro.tsx:433-705` |

## 6. State authority map (current)

See [state-architecture.md](state-architecture.md) for the full table. Summary of the
authorities that are **not** single-sourced:

| Value | Competing authorities |
|---|---|
| Active clip set | `renderSnapshot` (atomic) vs `selectActivePreviewCompositorPlan` recomputed in `CanvasExportRenderer` |
| Export FPS | React state `exportFps` vs `activeSettings.fps` |
| Transform composition | `getPreviewTransformCss` (CSS order) vs inline `ctx.translate/rotate/scale` (canvas order) |
| Export job dispatch | `beginExport` vs `RenderPipeline.executionTail` vs `ExportQueueManager` poller |
| Export job status | `RenderPipeline` writes vs `useExportStore.cancelJob` writes vs UI polling |
| Transport time | `TransportClock` (owns elapsed) vs `useProjectStore.currentTime` (published) |
| Media identity | `blob:` URL vs `https:` URL vs `data:` URL — no `AssetId` exists |

## 7. Target architecture (summary — full detail per sub-document)

```
UI (React)                     — displays state, emits intents. Owns NOTHING long-running.
   ↓
Application / Workflow layer   — NEW. WorkflowDefinition/Run/Step, state machines,
   ↓                             cancellation, retry, timeout, checkpoints, idempotency.
Domain / Core                  — canonical project model, duration, transform, compositor
   ↓                             plan, render model. Pure, React-free, DOM-free.
Infrastructure                 — media pools, encoders, persistence, HTTP, AI gateway,
                                 logging. Implements domain contracts.
   ↓
Server (Cloud Run)             — AI operation allowlist, server-owned models/limits,
                                 health, structured logs. No ffmpeg.
```

Five new/changed authorities:

| New authority | Replaces | Document |
|---|---|---|
| `AssetRegistry` + `AssetId` | `blob:` URLs in project state | [persistence-architecture.md](persistence-architecture.md) |
| `ExportMediaPool` | `ExportMediaRegistry` DOM scraping | [export-architecture.md](export-architecture.md) |
| `CanonicalTransformMatrix` | two divergent transform compositions | [rendering-architecture.md](rendering-architecture.md) |
| `WorkflowRuntime` | `useEffect([isExporting])` + `setInterval` poller | [workflow-architecture.md](workflow-architecture.md) |
| `AiOperationGateway` (server) | `ai.models.generateContent(req.body)` | [../security/security-model.md](../security/security-model.md) |

## 8. Sub-documents

| Document | Scope |
|---|---|
| [runtime-topology.md](runtime-topology.md) | Processes, ports, filesystem, network, secrets |
| [module-boundaries.md](module-boundaries.md) | Allowed import edges and enforcement |
| [dependency-direction.md](dependency-direction.md) | Violations V1–V5 and the repair order |
| [state-architecture.md](state-architecture.md) | Every value, its owner, and its lifecycle |
| [media-pipeline.md](media-pipeline.md) | Timing, seeking, decoding, duration authority |
| [rendering-architecture.md](rendering-architecture.md) | Canonical render model + parity contract |
| [export-architecture.md](export-architecture.md) | Export runtime, jobs, resources |
| [workflow-architecture.md](workflow-architecture.md) | Workflow engine + state machines |
| [persistence-architecture.md](persistence-architecture.md) | Metadata vs assets, AssetId, hydration |
| [ai-architecture.md](ai-architecture.md) | AI service boundary, operation allowlist, models |
| [deployment-architecture.md](deployment-architecture.md) | **AI Studio Web App runtime** (primary), optional external deployment, env, health |
| [AI-STUDIO-MEDIA-RUNTIME.md](AI-STUDIO-MEDIA-RUNTIME.md) | Capability classification A–E, canonical export strategy, FFmpeg evaluation |

---

## 9. Target runtime (reconciled 2026-09-09 — authoritative)

> **Neural-Pro's primary runtime target is the Google AI Studio Web App environment.
> Cloud Run is not a mandatory runtime dependency.**

This section supersedes any earlier statement in this document that treated Cloud Run as the
deployment target.

| Aspect | Target |
|---|---|
| **Target runtime** | **Google AI Studio Web App runtime** (Build mode) |
| **Primary deployment assumption** | **AI Studio-native** — the app is opened, developed, run, tested and used inside AI Studio |
| **Cloud Run** | **Optional / non-required** — it is the substrate AI Studio uses when you Publish, and an optional self-managed path afterwards |
| **Server runtime** | **AI Studio-supported Node.js server runtime** — npm packages, server-side secrets, outbound network. No media processing, no durable writes, no background jobs |
| **Gemini** | **Server-side secret + controlled operation gateway** (`client intent → validated operation → server-owned configuration → Gemini`) |
| **Export** | **Browser-native** (Canvas2D + WebCodecs + Web Audio + `mp4-muxer`) — ADR-016 |
| **Persistence** | **Browser-side durable assets** (IndexedDB + `AssetId`); network stores are an optional future adapter |
| **Workflow engine** | **Application-level** state machine in the app (W1–W5) |

### Capability classes (summary)

| Class | Count | Meaning |
|---|---|---|
| A — officially supported | 14 | may be architected upon |
| B — supported with constraints | 6 | bounded or AI Studio-managed |
| C — RUNTIME-UNKNOWN | 12 | must be resolved by execution inside AI Studio (WP-13) |
| D — unsupported / incompatible | 6 | documented absence or contradicts the platform model |
| E — optional external deployment | 4 | only with an accepted external dependency |

Full table: [AI-STUDIO-MEDIA-RUNTIME.md](AI-STUDIO-MEDIA-RUNTIME.md) §2.

### Structural facts after the correction

| ID | Fact |
|---|---|
| F1 | Export is a DOM parasite of Preview (unchanged defect; also blocks headless verification) |
| F2 | The parity/diagnostics subsystem is unreachable (unchanged) |
| F3 | Two renderers, divergent semantics (unchanged) |
| F4 | No workflow engine; React effects and a `setInterval` poller play the part (unchanged) |
| **F5** | **The repository contains an AI Studio app manifest (`metadata.json`) and a live `ai.studio/apps/…` id — the app is already an AI Studio app. It was previously unexamined and had been scheduled for deletion as "scratch".** |
| **F6** | **`.env.example` already exists and documents AI Studio-injected `GEMINI_API_KEY` and `APP_URL`. `APP_URL` is not dead — it is injected with the service URL.** |
| **F7** | **`const PORT = 3000` is the AI Studio convention, not an AI Studio failure. The app runs there today. It remains a portability defect for optional external deployment (D-015 downgraded P1 → P2).** |
| **F8** | **There is no server-side durable storage in the AI Studio Web App runtime. Browser-side storage is the only runtime-appropriate durable default.** |

### Freeze

The reconciled, frozen architecture is recorded in
[../execution/ARCHITECTURE-FREEZE.md](../execution/ARCHITECTURE-FREEZE.md).
