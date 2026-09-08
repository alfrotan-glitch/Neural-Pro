# State Architecture

**Status:** current (measured) + target. Owns the single-source-of-truth policy.

---

## 1. Stores (current)

| Store | File | Holds | Mutated by |
|---|---|---|---|
| `useProjectStore` | `store/useProjectStore.ts` (494) | `tracks`, `metadata`, `currentTime`, `totalDuration`, `isPlaying`, `animations`, selection, UI prefs (`timelineZoom`, `theme`, `activeTool`, marks, clipboard) | `executeCommand` (domain), plus direct setters for UI prefs |
| `useHistoryStore` | `store/useHistoryStore.ts` (90) | `past: Command[]`, `future: Command[]`, `maxCapacity: 50` | `addCommand`, `undo`, `redo` |
| `useExportStore` | `store/useExportStore.ts` (226) | export settings + `jobs[]` | settings setters, job CRUD |
| `useSubscribeStore` | `store/useSubscribeStore.ts` (135) | subscribe-generator props | setters |

**Circular dependency (V2):** `useProjectStore.executeCommand` → `useHistoryStore.addCommand`;
`useHistoryStore.undo/redo` → `useProjectStore.setState`. Works only because both use
`getState()` at call time. Not expressible as a DAG.

## 2. State authority map (current)

| Value | Created by | Owner | Competing definitions? | Verdict |
|---|---|---|---|---|
| `tracks` | store default / commands | `useProjectStore` | `CanvasExportRenderer` recomputes the compositor plan because `renderSnapshot` is `undefined` | **CONFLICT** |
| `totalDuration` | `calculateProjectDuration(tracks)` | derived, cached in store | none — `setTotalDuration` ignores its argument | ✔ single |
| `currentTime` | user / `TransportClock` | clock owns elapsed; store publishes | reconciled by a 0.001 s threshold | ✔ acceptable |
| playing state | `useProjectStore.isPlaying` | store | `TransportClock.playing` mirrors it | **minor duplication** |
| active clip set | `selectActivePreviewCompositorPlan` | compositor index | snapshot vs recompute | **CONFLICT** |
| clip transform | `getCanonicalClipTransform` | canonical module | CSS order vs canvas order | **CONFLICT (D-004)** |
| export FPS | `ExportSettings.fps` | export settings | React state `exportFps` in `VideoStudioPro` | **CONFLICT (D-020)** |
| export job status | `RenderPipeline` | should be one machine | `RenderPipeline` writes, `useExportStore.cancelJob` writes, `ExportQueueManager` polls | **CONFLICT** |
| export dispatch | — | should be one authority | `beginExport` + `executionTail` + `setInterval` poller | **CONFLICT (R-014)** |
| media identity | `URL.createObjectURL` | none | `blob:` / `https:` / `data:` with no `AssetId` | **CONFLICT (D-006)** |
| generated audio duration | never measured | — | assumed = `totalDuration` | **CONFLICT (D-024)** |
| `waveformData` | `Math.random()` | — | regenerated per sync, persisted | **NON-DETERMINISTIC** |
| theme / zoom / tool | store | store | none | ✔ |

## 3. Target ownership (normative)

| Domain concept | Canonical owner | Notes |
|---|---|---|
| **Project** | `useProjectStore` (+ `ProjectDocumentV2` on disk) | the only writer of project data is `executeCommand` |
| **Track / Clip** | commands (`src/features/video-studio/**/commands`) | immutable transitions |
| **Media Asset** | `AssetRegistry` | the only issuer of `AssetId` and object URLs |
| **Timeline geometry** | `timelineGeometry` / `timelineViewportGeometry` | px↔time conversion |
| **Duration** | `clipTimelineDuration` + `projectDuration` + `AssetRecord.duration` | measured once at import |
| **Transform** | `clipTransformModel.getCanonicalTransformMatrix` | one matrix, order-fixed |
| **Active clip selection** | `previewCompositorIndex.selectActivePreviewCompositorPlan` | one function, cached per tracks identity |
| **Render plan** | `buildCanonicalRenderPlan` | only producer |
| **Render FPS** | `RenderFpsAuthority` derived from `ExportSettings.fps` | threaded everywhere |
| **Export settings** | `useExportStore` | single source |
| **Export job status** | `WorkflowRuntime` state machine | store mirrors it; UI renders it |
| **Workflow run state** | `WorkflowRuntime` | React subscribes |
| **Persistence identity** | `projectId` + `AssetId` | never a blob URL |
| **History** | `useHistoryStore` | depends on commands being pure |

### Rule

> No component may compute a domain value that a canonical module already owns.
> No renderer may recompute domain semantics.
> No workflow may maintain undocumented shadow state (refs are allowed only as caches whose
> invalidation is explicit).

## 4. Store ↔ execution-state synchronisation contract

Today the export job status is written from three places. Target contract:

1. `WorkflowRuntime` is the **only** writer of run/job status.
2. The store subscribes to the runtime and mirrors status into `useExportStore.jobs[]` for
   rendering. Mirroring is one-way: `runtime → store`.
3. UI actions (`cancel`, `retry`) are intents dispatched to the runtime, never direct status
   writes.
4. Every status write is accompanied by a structured log event with `runId`, `from`, `to`.
5. On unmount, the store **detaches** but the runtime **keeps running** to a terminal state
   (so a job started in a panel that closes still completes or cancels cleanly).

## 5. In-memory vs durable

| State | In-memory | Durable | Notes |
|---|---|---|---|
| `tracks`, `metadata`, `animations` | ✔ | ✔ (IndexedDB doc) | asset refs by `AssetId` |
| `currentTime` | ✔ | ✔ (nice-to-have) | clamp on hydrate |
| selection, zoom, tool, theme | ✔ | theme ✔, others ✘ | UI prefs may be persisted separately |
| `isPlaying` | ✔ | ✘ | must never persist as `true` (already handled ✔) |
| export jobs | ✔ | ✘ | lost on reload — **documented limitation**; a job must reach a terminal state in-session |
| object URLs | ✔ | ✘ | **never persisted** |
| `AudioContext` / pools | ✔ | ✘ | infrastructure |

## 6. Invariants enforced by validation (already present — preserve)

`assertValidProjectState`, `assertNoLockedTrackContentMutation`, `assertClipsEditable`,
`normalizeSelectedNodeIds`, `timelineInvariants`, `lockedTrackInvariants`.

**Risk:** these throw. With **no React error boundary anywhere** (D-013), a thrown invariant
unmounts the whole tree → white screen. Target: invariants throw in tests; in production they
throw into a boundary that offers "undo last action" / "restore last save".
