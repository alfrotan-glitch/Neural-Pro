# Export Architecture

**Status:** current (P0-broken) + target. Owns **INV-002** (export must not depend on Preview
DOM) and **INV-004** (all exported media independently resolvable).

---

## 1. Why export must be independent of Preview

`src/core/engine/render/ExportMediaRegistry.ts` currently does:

```ts
document.querySelectorAll<HTMLVideoElement>('[data-export-media-clip-id]')
```

and throws if two elements share a clip id. Those elements are produced by
`VideoPlayer.tsx:497`, which maps over `renderSnapshot.byRole.video` — **only the clips active
at the playhead**. Export calls it once, after `setCurrentTime(0)`.

### Measured consequence (default project)

```
v1_clip [0, 18.5)   v2_clip [18.5, 30.5)   v3_clip [30.5, 45)
registry at t=0 → ['v1_clip']
frames with an unresolvable active clip → 795 / 1350  (58.9 %)
clips rendered as purple placeholder     → v2_clip, v3_clip
```

`CanvasExportRenderer` takes `if (!drawn)` and paints a gradient + the clip name.

Additional couplings:
* If the Preview panel is closed or re-docked (`DockableWorkspace` allows this), **zero**
  media elements exist.
* React re-renders during export can replace the nodes, detaching the captured references.
* Export cannot be tested headlessly, because there is no Preview.

---

## 2. Target: the export runtime

```
ExportRequest
  ↓ validate
ExportJob (persisted in the job store, status via state machine)
  ↓
ExportRuntime.run(job, signal, onProgress)
  ├─ 1. resolveAssets(projectSnapshot)      → AssetId → AssetHandle  (NO DOM)
  ├─ 2. ExportMediaPool.prepare(handles)    → decoded/seekable sources
  ├─ 3. renderProjectAudio(snapshot)        → AudioBuffer            (OfflineAudioContext)
  ├─ 4. for each frame:
  │        plan = buildCanonicalRenderPlan(snapshot, t, fps, pool)
  │        renderer.render(plan, canvas)
  │        encoder.encode(new VideoFrame(canvas, {timestamp}))
  ├─ 5. encodeAudio(audioBuffer)
  ├─ 6. muxer.finalize() → Blob
  └─ finally: pool.dispose(); encoder.close(); muxer disposed; frames closed
```

**Hard rule:** no step may call `document.querySelector`, read a React ref, or depend on a
mounted component. Export must be runnable from a Web Worker or a Node test harness with a
stubbed media source (enforced by a lint rule and by a test that runs export with the Preview
unmounted — required test invariant #5).

## 3. ExportMediaPool (new — replaces ExportMediaRegistry)

```ts
export interface MediaSourceRequest {
  readonly clipId: string;
  readonly assetId: AssetId;
  readonly kind: 'video' | 'audio' | 'image';
  readonly sourceRange: { start: number; end: number | null };
}

export interface MediaFrameSource {
  readonly clipId: string;
  readonly ready: Promise<void>;
  /** intrinsic dimensions, 0 until ready */
  readonly width: number; readonly height: number;
  readonly duration: number;
  /** seek to source time and await frame availability */
  seek(sourceTime: number, signal?: AbortSignal): Promise<void>;
  readonly element: HTMLVideoElement | HTMLImageElement | null;
}

export interface ExportMediaPool {
  prepare(requests: readonly MediaSourceRequest[], signal?: AbortSignal): Promise<void>;
  get(clipId: string): MediaFrameSource | undefined;
  dispose(): void;                      // releases every element, URL and decoder
}
```

Behaviour:
* Elements are created with `document.createElement` and are **never inserted into the
  React tree** — they may be detached entirely (`preload=auto`, `muted`, `crossOrigin`).
* `prepare()` awaits `loadedmetadata` for every request, bounded by a timeout; a failure
  produces a typed `MEDIA_PREPARE_FAILED` error naming the clip, never a silent placeholder.
* `dispose()` is called in `finally` for **every** terminal path (completed, failed,
  cancelled) — verified by test invariant #16.

## 4. Contracts

```ts
export type ExportJobStatus =
  | 'queued' | 'validating' | 'preparing' | 'running'
  | 'finalizing' | 'completed' | 'cancelled' | 'failed' | 'expired';

export interface ExportJob {
  readonly id: ExportJobId;              // job_<uuid>
  readonly idempotencyKey: string;       // hash(snapshot + settings + scope)
  readonly projectName: string;
  readonly status: ExportJobStatus;
  readonly progress: number;             // 0..100, monotonic within a run
  readonly phase: ExportPhase | null;
  readonly settings: ExportSettings;
  readonly projectSnapshot: ExportProjectSnapshot;   // structuredClone'd, immutable
  readonly runId: WorkflowRunId;         // links to the workflow runtime
  readonly attempt: number;
  readonly error: ExportError | null;
  readonly downloadUrl?: string;
  readonly startedAt?: string; readonly endedAt?: string;
}

export interface ExportError {
  readonly code: ExportErrorCode;        // see contracts/errors.md
  readonly message: string;              // safe for UI
  readonly detail?: string;              // developer diagnostics, never user-facing secrets
  readonly phase: ExportPhase;
  readonly retryable: boolean;
  readonly clipId?: string;
}

export type ExportResourceLifecycle =
  | { phase: 'created'; owner: string }
  | { phase: 'acquired'; owner: string }
  | { phase: 'released'; owner: string }
  | { phase: 'leaked'; owner: string; reason: string };
```

## 5. State machine

```
                    ┌──────────► cancelled ◄──────────┐
                    │                                 │
queued ─► validating ─► preparing ─► running ─► finalizing ─► completed
   │          │            │           │            │
   └──────────┴────────────┴───────────┴────────────┴──► failed
                                                    └────► expired (timeout)
```

Legal transitions are enforced by a single `canTransition(from, to)` table. **Illegal
transitions throw** in tests and are ignored-with-log in production.

| From | To |
|---|---|
| queued | validating, cancelled, expired |
| validating | preparing, failed, cancelled |
| preparing | running, failed, cancelled |
| running | finalizing, failed, cancelled, expired |
| finalizing | completed, failed, cancelled |
| completed / failed / cancelled / expired | ∅ (terminal) |

**Current defect D-010.** `RenderPipeline.cancelJob` bumps the run token **before** aborting;
`executeJob`'s `if (!isCurrentRun(jobId, runToken)) return false` then skips the status write,
so a cancelled job stays `rendering` forever. For a *queued* job there is no
`AbortController`, so the function only deletes the run token — which `executeJob`
immediately re-creates, and the cancelled job runs anyway.

Reproduced (`audit/repro-export-queue.mts`, exit 1):
```
CASE 1  cancelled queued job B still executed         → DEFECT
CASE 2  job C stuck at "rendering" after cancel       → DEFECT
CASE 3  sequential drain of two jobs                  → ok
```

## 6. Idempotency and duplicate execution

`idempotencyKey = hash(projectSnapshot + settings + clipIds)`. Submitting a job whose key
matches a non-terminal job returns the existing job id instead of creating a second one.
`RenderPipeline` keeps exactly one `AbortController` per job and refuses a second
`executeJob` for a job that is not `queued`.

**Structural risk R-014 (unverified as a failure).** Three dispatch authorities exist today:
`VideoStudioPro.beginExport()`, `RenderPipeline.executionTail`, and the
`setInterval(1500)` orchestrator in `ExportQueueManager`. `audit/repro-queue-deadlock.mts`
tested two deadlock hypotheses and **disproved both** — the `job.status !== 'waiting'` guard
absorbs late duplicates, and the serialised tail recovers the parallel case. The test is kept
as a guard. The structural smell remains: a polling orchestrator duplicating a pipeline that
already serialises, with an `async` callback inside `setInterval` (no re-entrancy lock) and a
`processMode === 'parallel'` UI promise that the pipeline cannot honour. **WP-04 must collapse
these to one authority.**

## 7. Resource lifecycle (export)

| Resource | Created | Owner | Released |
|---|---|---|---|
| `HTMLVideoElement` pool | `ExportMediaPool.prepare` | pool | `dispose()` in `finally` |
| `ImageBitmap` | `preloadExportOverlayImages` | image cache | `close()` per export (already done ✔) |
| `AudioBuffer` | `renderProjectAudio` | export run | dropped after encode |
| `VideoEncoder` | `exportVideoWebCodecs` | export run | `finally { close() }` ✔ |
| `AudioEncoder` | same | same | `finally { close() }` ✔ |
| `Muxer` | same | same | **NOT released on abort today** → WP-11 |
| `VideoFrame` | per frame | export run | `finally { frame.close() }` ✔ |
| `ondequeue` handlers | back-pressure wait | export run | **LEAK — D-016** |
| `Blob` download URL | completion | export store | revoked on replace/remove/clear ✔ |
| `setInterval` orchestrator | `ExportQueueManager` mount | component | must be cleared on unmount |

**D-016 evidence** (`audit/repro-ondequeue-leak.cjs`, exit 1): the 100 ms timeout path never
restores `previous`, so handlers accumulate — **199 stale closures per 200 stalled frames**.

## 8. FFmpeg

The server-side FFmpeg pipeline (`server.ts:738`, `/api/export/*`) is **removed** by ADR-004:
* the binary is not a declared dependency and is absent from Cloud Run / AI Studio;
* `spawn ffmpeg` returns `ENOENT` (measured);
* the client WebCodecs path is the only functioning encoder;
* maintaining two encoder back-ends with different output guarantees is a parity risk.

If a server-side encoder is ever needed, it must arrive as an explicit, versioned, declared
dependency with its own parity tests — not as an undeclared `spawn`.
