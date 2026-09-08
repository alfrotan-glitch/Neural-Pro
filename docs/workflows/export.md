# Workflow W4 — Export

**Owner WP:** WP-02 (independence), WP-03 (parity), WP-04 (runtime), WP-11 (resources)
**Normative contracts:** [../contracts/workflows.md](../contracts/workflows.md),
[../contracts/rendering.md](../contracts/rendering.md),
[../architecture/export-architecture.md](../architecture/export-architecture.md)

---

## 1. Trigger

Export settings form → **Export** → `ExportRequest { snapshot, settings, clipIds, scope }`.
Also triggered by `ImportProjectSettingsModal` ("Import + Export").

## 2. Steps (target)

| # | Step | Checkpoint | Retry | Timeout | Notes |
|---|---|---|---|---|---|
| 1 | `validate` | – | no | 5 s | settings in range; codec support probe; capabilities present; **all referenced assets resolvable** (else `ASSET_MISSING`, fail fast) |
| 2 | `prepareMedia` | ✔ | 1 | 60 s | `ExportMediaPool.prepare` — **no DOM scraping** |
| 3 | `renderAudio` | ✔ | no | 10 min | `OfflineAudioContext`; deterministic envelope; measured asset durations |
| 4 | `encodeVideo` | – | no | 25 min | frame loop: `buildCanonicalRenderPlan` → `Renderer.render` → `VideoFrame` → `VideoEncoder` |
| 5 | `encodeAudio` | – | no | 5 min | |
| 6 | `finalize` | – | no | 60 s | mux → Blob |
| 7 | `publish` | – | no | 10 s | object URL + store update + download |
| 8 | `cleanup` | – | no | 10 s | **always runs** (finally) |

## 3. Progress

`progress` is monotonic and derived from `framesEncoded / totalFrames`, with phase labels
matching `ExportPhase`. Progress is published by the runtime, not by a component's timer.

## 4. Cancellation

| State at cancel | Target behaviour | Current behaviour |
|---|---|---|
| `queued` (not started) | → `cancelled`, never executes | **executes anyway** (D-010 case 1) |
| `running` | abort → cleanup → `cancelled` | **stays `rendering` forever** (D-010 case 2) |
| `finalizing` | abort mux → cleanup → `cancelled` | muxer not released |

## 5. Current implementation (as-executed)

```
VideoStudioPro.tsx:433  useEffect(() => { … }, [isExporting])
  ├─ setCurrentTime(0)
  ├─ ExportMediaRegistry.scanForExportFromPlayer()   ← DOM scrape (D-001)
  ├─ renderProjectAudio(snapshot)                    ← clamps duration (D-024)
  ├─ exportVideoWebCodecs({ …, fps: activeSettings.fps, onProgress })
  ├─ CanvasExportRenderer.renderFrame(snapshot, t, mediaRegistry, undefined)
  │     └─ renderSnapshot undefined ⇒ recompute ⇒ parity subsystem skipped (D-007)
  └─ onProgress → setExportProgress(percent)

RenderPipeline (892)
  ├─ executeJob: guard `job.status !== 'waiting'`; token guard; serialises on executionTail
  ├─ cancelJob: deletes token, then aborts  ⇒ token guard skips the status write
  └─ cancelQueuedJob: only deletes the token ⇒ job runs anyway

ExportQueueManager (setInterval 1500)
  └─ for every job with status 'waiting' → pipeline.renderJob(job)   ← third dispatch authority
```

**Measured:** 795 / 1350 frames (58.9 %) of the default project render with an unresolvable
active clip. Cancel reproduced broken (2 defects).

## 6. Required tests

| # | Test | Current |
|---|---|---|
| 1 | Export produces correct frame count | **FAIL** (registry) |
| 2 | Export matches preview transform | **FAIL** (D-004) |
| 5 | Export succeeds with preview unmounted | **FAIL** (structural) |
| 6 | Cancel before render completes reaches terminal state | **FAIL** (D-010) |
| 7 | Export releases all resources | **UNVERIFIED** |
| 8 | Registry resolves all media | **FAIL** |
| 16 | Cancel during every step releases resources | **UNVERIFIED** |
| 17 | Export uses one FPS authority | **FAIL** (D-020) |
| 18 | Queued job cancel prevents execution | **FAIL** (D-010) |

## 7. Acceptance

* `audit/repro-export-registry.mts` exits 0
* `audit/repro-transform-order.mts` exits 0
* `audit/repro-media-cover-clip.mts` exits 0
* `audit/repro-export-queue.mts` exits 0
* Export runs headlessly (preview unmounted) and produces a playable MP4
* Cancel at each of the 8 steps reaches a terminal state and releases resources
