# ADR-017 — Canonical Core (domain kernel)

**Status:** Accepted
**Date:** 2026-09-09
**Owner:** Core Architecture (Principal Architect)
**Supersedes:** nothing. **Amends:** [../contracts/project-state.md](../contracts/project-state.md) §3 (semantic separation) and §9 (added)
**Implements:** [ADR-012](ADR-012-layered-modules.md) (L2 domain layer), [ADR-000](ADR-000-source-of-truth-precedence.md) (code is the truth)
**Related:** [ADR-013](ADR-013-compatibility-shim-policy.md) (SHIM-006, SHIM-007)

---

## Context

Neural-Pro has been built feature-first. Every core concept ended up defined in more than one
place, and the duplicates have drifted. This is not style debt: it is why the system cannot give
one answer to "how long is this clip?" or "what is the project framerate?".

### Competing sources of truth (verified by import-graph inspection, not by reading names)

| Concept | Competing definitions | Evidence |
|---|---|---|
| **Clip** | `ClipNode` (live) vs `TimelineClip`/`VideoTimelineClip`/`AudioTimelineClip`/`CaptionTimelineClip`/`ElementTimelineClip` (dead) | `features/video-studio/project/types/project.ts:59`; `features/video-studio/timeline/types/timeline.ts:8-49` |
| **Track** | `Track` (`type`, 4 values) vs `TimelineTrack` (`TimelineTrackType`, 8 values) | `project/types/project.ts:46`; `timeline/types/timeline.ts:52` |
| **Project** | `ProjectState` (live) vs `VideoStudioProject` (dead) | `project/types/project.ts:12` vs `:72` |
| **Duration** | `core/engine/clipTimelineDuration.ts` vs `features/.../playback/services/mediaTimeMapper.ts` — two byte-identical `getClipPlaybackRate` implementations | `clipTimelineDuration.ts:32`; `mediaTimeMapper.ts:13` |
| **Frames / FPS** | `metadata.fps` · `ExportJob.settings.fps` · `DEFAULT_CAPTION_FPS = 30` | `VirtualizedTimeline.tsx:1596`; `ExportPanel.tsx:51`; `captionTimecodeService.ts:4` (INV-013 **FAIL**: three fps sources) |
| **Time mapping** | `mediaTimeMapper.projectTimeToSourceTime` vs the same rule re-derived in `clipTimelineDuration.getCanonicalClipSourceDuration` | `mediaTimeMapper.ts:38`; `clipTimelineDuration.ts:38` (both encode `trim.in`, differently — see F-1) |
| **Transform** | `ClipNode.transform` vs `CanonicalClipTransform` vs `canvas/types.Transform` (a *layout box*, unrelated units) | `project.ts:59`; `clipTransformModel.ts:3`; `canvas/types/canvas.ts:22` |
| **Geometry** | `mediaFrameGeometry` vs `timelineGeometry` vs `timelineViewportGeometry` vs `timelineClipGeometry` — and two different `getVisible…TimeRange` implementations | `mediaFrameGeometry.ts:17`; `timelineGeometry.ts:91`; `timelineViewportGeometry.ts:46` |
| **Identity** | `type UUID = string` declared in `features/.../shared/types/identity.ts`, re-exported from `project/types/project.ts` **and** from the (now deleted) root barrels | `shared/types/identity.ts:1`; `project.ts:153` |

The root barrels `src/types.ts` and `src/types/schema.ts` were the only importers of the dead
`VideoStudioProject` model (`VideoScene`, `SceneTransition*`, `Timeline`, `TimelineTrack`,
`TimelineClip*`, `MediaAsset`, `ProjectCanvas`). They had **zero importers** and were not listed
in [../execution/file-ownership-matrix.md](../execution/file-ownership-matrix.md).

### Why "just add a lint rule" does not work

ADR-012 already specifies the four layers and the one-way edges. The reason it has not been
implemented is that there was nothing to move code **to**: `src/domain/**` did not exist, so the
first mover would have had to invent the domain vocabulary while moving files — which is a
rewrite, and ADR-012 forbids that.

---

## Decision

### 1. There is a canonical core, and it lives in `src/domain/core/**`

Pure TypeScript (L2 per ADR-012). No React, no DOM, no `fetch`, no timers, no storage,
no `Math.random`, no `Date.now`, no `process.env`, no `crypto`. It imports **only**
`src/domain/**` — which is what finally breaks violation **V1** (`core → features`).

| Module | Owns | Canonical answers |
|---|---|---|
| `identity.ts` | `UUID`, `ProjectId`, `AssetId`, `TrackId`, `ClipId`, `SourceId` | what an id is |
| `fps.ts` | `Fps`, `resolveRenderFps`, `normalizeFps` | **the one framerate** (INV-013) |
| `time.ts` | `Seconds`, `FrameIndex`, frame projection, half-open `TimeInterval` | how time is measured |
| `duration.ts` | playback rate, source range, clip/project duration, project↔source mapping | how long a clip is |
| `geometry.ts` | `Size`/`Rect`, the 85 % media frame, `FitMode` | where media sits |
| `transform.ts` | `CanonicalTransform`, canonical `T · R · S` matrix and CSS | how a clip is placed |
| `clip.ts` | `PersistedClip` → `CanonicalClip`, `MediaKind` | what a clip is |
| `track.ts` | `TrackKind` vs `LaneRole`, `TrackState` | what a track is |
| `project.ts` | `CanonicalProject`, derived `totalDuration` | what a project is |
| `validation.ts` | atomic predicates (`assertFinite`, …) | what a valid value is |
| `errors.ts` | `DomainInvariantError` | how a rule violation is reported |

### 2. Persisted shape and canonical shape are deliberately different

`PersistedClip` is **loose** and structurally compatible with today's `ClipNode`, so the whole
executing codebase can adopt the core with zero edits. `CanonicalClip` is **strict**: every
number finite, every transform normalised. `normalizeClip` is the only bridge, and it is
**total** — it never throws and never emits a non-finite value.

### 3. Dependency direction

```
src/ui/** ──► src/app/** ──► src/domain/core/** ◄── src/infra/**
                                    ▲
                              server/** (domain only)
```

`src/domain/core/**` depends on nothing outside `src/domain/`. Existing modules may import the
kernel immediately; the kernel may never import them back.

### 4. Consolidation map — what happens to every duplicate

| # | Existing module | Disposition | Owner | By |
|---|---|---|---|---|
| 1 | `core/engine/clipTimelineDuration.ts` | **delegate** — re-export `duration.ts` (kills V4) | WP-08 | WP-12 |
| 2 | `core/engine/projectDuration.ts` | **delegate** — re-export `duration.ts` | WP-08 | WP-12 |
| 3 | `features/.../playback/services/mediaTimeMapper.ts` | **delegate** — re-export `duration.ts` | WP-03 | WP-12 |
| 4 | `features/.../playback/services/clipTransformModel.ts` | **delegate** the pure part; CSS emission reconciled under F-2 | WP-03 | WP-12 |
| 5 | `features/.../playback/services/mediaFrameGeometry.ts` | **delegate** — re-export `geometry.ts` | WP-03 | WP-12 |
| 6 | `features/.../project/time/{clipBounds,intervals}.ts` | **delegate** — re-export `time.ts` / `duration.ts` | WP-08 | WP-12 |
| 7 | `features/.../project/types/project.ts` | **adopt** — `ClipNode`/`Track` re-export the kernel types | WP-05 / WP-08 | WP-12 |
| 8 | `features/.../shared/types/identity.ts` | **adopt** — re-export `identity.ts` | WP-05 | WP-12 |
| 9 | `features/.../timeline/types/timeline.ts` (dead `Timeline`/`TimelineTrack`/`TimelineClip*`) | **delete** — unreachable since the root barrels were removed | WP-08 | WP-12 |
| 10 | `VideoStudioProject` + `VideoScene`/`SceneTransition*`/`MediaAsset`/`ProjectCanvas` | **delete** — unreachable dead model | WP-05 / WP-08 | WP-12 |
| 11 | `features/.../timeline/geometry/*` | **keep** — timeline geometry is a *view projection* and stays at L4; it must consume `time.ts` for the seconds↔pixels conversion | WP-08 | WP-12 |
| 12 | `canvas/types.Transform` (layout box) | **rename** to `CanvasElementLayout` — it is not a clip transform | WP-08 | WP-12 |

Rows 1–8 are re-exports, i.e. **behaviour-preserving**: until they happen, the old paths keep
executing and the parity suite proves the kernel agrees with them.

### 5. `src/types.ts` and `src/types/schema.ts` are deleted

Evidence: zero importers across `src/`, `server.ts`, `tests/`, `audit/`, `scripts/`,
`resolution-test/`; not present in the file-ownership matrix. They were the only consumers of
the dead project model. `src/types/export.ts` is retained (one live importer, WP-03).

Verification after deletion: `tsc --noEmit` exit 0; `npm test` exit 0 (`PHASE9_TEST_SUITE=PASS`).

### 6. Findings recorded, not silently fixed

| ID | Finding | Evidence | Owner |
|---|---|---|---|
| **F-1** | `mediaTimeMapper.projectTimeToSourceTime` returns `NaN` for a non-finite project time (`Math.max(0, NaN)`), and callers assign it straight to `videoEl.currentTime` (`mediaSyncController.ts:34`, `playbackService.ts:44`). `projectDuration.clampProjectTime(t, NaN)` also returns `NaN` (**F-1b**) and feeds `currentTime`. The kernel clamps instead. | pinned in `tests/domain-core/parity.test.ts` | WP-11 |
| **F-2** | The executing preview emitter `getPreviewTransformCss` emits `translate3d(…) scale(sx, sy) rotate(r)` = **T · S · R**; the canonical order in `contracts/project-state.md` §4 is **T · R · S**. Identical for a uniform scale; divergent exactly when `scaleX ≠ scaleY` **and** `rotation ≠ 0` — the D-004 case (measured drift 662.019 px). | pinned in `tests/domain-core/transform.test.ts` | WP-03 |
| **F-3** | **DECIDED 2026-09-09 (owner).** `getCanonicalClipSourceDuration` answered two different questions behind one name: `persisted − trim.in` when persisted metadata existed, `trim.out − trim.in` otherwise. The canonical clip source duration is now **the trim window**; the persisted value is redefined as the asset's intrinsic duration. Canonical core updated; **downstream integration is WP-11's** and is not enforced here. | pinned in `tests/domain-core/duration.test.ts` and `parity.test.ts` | WP-11 (integration) |
| **F-4** | Two `getVisible…TimeRange` implementations disagree: `timelineGeometry.getVisibleTimeRange` uses the raw viewport width; `timelineViewportGeometry.getVisibleTimelineTimeRange` subtracts `TIMELINE_HEADER_WIDTH` (160 px) first. One of them is wrong by 160 px of time. | `timelineGeometry.ts:91` vs `timelineViewportGeometry.ts:46` | WP-08 / WP-11 |

---

## F-3 decision (2026-09-09) — canonical clip source duration is the TRIM WINDOW

**Status:** decided by the project owner. Recorded here and in
[../contracts/project-state.md](../contracts/project-state.md) §3. **Downstream production
modules are deliberately NOT updated — WP-11 owns that integration.**

### The four quantities, separated

Four different quantities previously shared the name "source duration". Each now has exactly one
name, one function and one meaning:

| # | Concept | Definition | Canonical function | `null` means |
|---|---|---|---|---|
| 1 | **Media intrinsic duration** | duration of the source **asset** | `duration.getMediaIntrinsicDuration` | the asset duration is unknown |
| 2 | **Trim duration** | `trim.out − trim.in` | `duration.getTrimDuration` | the clip has no valid trim window ⇒ **unbounded** |
| 3 | **Effective clip duration** | trim duration ÷ playback rate | `duration.getEffectiveClipDuration` | unbounded |
| 4 | **Timeline duration** | `min(declared, effective)` | `duration.getTimelineDuration` | n/a — always finite |

### Rules

1. **The canonical clip source duration is the trim window** (#2). It is the only answer to
   "how much source media may this clip consume".
2. **Media intrinsic duration (#1) is never a bound on a clip.** It is a cache of
   `AssetRegistry.measure()` (ADR-010, WP-05) persisted on the clip so an export snapshot or a
   cold reload can still *validate* a trim window when the live media handle is gone.
3. **The declared `duration` remains the editor's authoritative shortening**, which is why the
   timeline duration is `min(declared, effective)` and not `effective` alone.
4. **The old `getSourceDuration` is removed** from the kernel rather than kept as an alias — two
   names for one number is what produced F-3.

### What changed in the kernel

| Before | After |
|---|---|
| `getSourceDuration` — persisted metadata branch (`persisted − trim.in`) **and** trim branch (`trim.out − trim.in`), plus an `imageUrl`/`textContent` short-circuit to `null` | `getMediaIntrinsicDuration` (asset) · `getTrimDuration` (trim window) · `getEffectiveClipDuration` (÷ rate) · `getTimelineDuration` (`min(declared, effective)`). No kind-based short-circuit |

### Divergence that WP-11 must integrate

For a clip with `trim {in: 2, out: 9}`, `duration: 20`, `sourceMediaDuration: 12`:

| | legacy (`getCanonicalClipSourceDuration` / `…TimelineDuration`) | canonical (`getTrimDuration` / `getTimelineDuration`) |
|---|---|---|
| source bound | `12 − 2` = **10** | `9 − 2` = **7** |
| timeline duration | **10** | **7** |

Pinned executably in `tests/domain-core/parity.test.ts` (F-3) and `duration.test.ts`.

**Adoption note.** Under this definition a clip whose media is unbounded (image, text, generated
audio) is no longer unconditionally unbounded: if it carries a trim window, that window now
bounds it. The executing `clipTimelineDuration.ts` still short-circuits `imageUrl`/`textContent`
to `null`. WP-11 must verify against real projects before switching call sites over.

## Consequences

**Positive**

* One answer per question. `resolveRenderFps`, `getTimelineDuration`, `canonicalTransform`,
  `mediaFrameGeometry` and `TimeInterval` exist exactly once.
* `src/domain/**` exists, so ADR-012/WP-08 now has a destination rather than an invention task.
* Semantic duplication is prevented **executably**: `tests/domain-core/parity.test.ts` imports
  the modules that run today and fails if the kernel and they ever disagree.
* Every divergence (F-1…F-4) is pinned by a test with a named owner instead of being fixed
  silently inside an unrelated work package.

**Negative / accepted**

* For the staging window, some concepts are declared twice (kernel + legacy path). Registered
  as **SHIM-006** (`LaneRole`) and **SHIM-007** (duration/time/transform/geometry authorities),
  both owned by Core Architecture and removed by WP-12 — earlier if the adopting WP moves first.
* The kernel is not yet wired into production. Nothing calls it today; it is adopted by
  WP-03/05/08/11 as they touch their modules.
* `tests/domain-core/` is run by `npx tsx tests/domain-core/run.ts`. It is **not** yet registered
  in `tests/phase9/test-runner.cjs` (owned by WP-00/QA) — see Open items.

---

## Alternatives considered

| Alternative | Verdict |
|---|---|
| Nominal (branded) id types | **Rejected for now.** Every call site addresses entities by `string`; branding would force a migration before the kernel could be adopted. Strength here comes from one definition plus boundary validation. Revisit after WP-08. |
| Put the kernel in `src/core/engine/**` | **Rejected.** `core/**` is precisely the layer that imports `features/**` (V1). A kernel that lives inside a cycle cannot break it. |
| Delete the duplicates now | **Rejected.** They are executing authorities owned by other work packages; deleting them inside this ADR would be an unowned behaviour change, and ADR-012 requires the move to be behaviour-preserving. |
| Define a canonical `Timeline` entity | **Rejected.** "Timeline" in this codebase is a *view* (tracks + a pixel/second projection). The canonical entities are `Project` and `Track`; the projection stays at L4 (row 11). |

---

## Open items (owners named, not escalated for permission)

1. **WP-00 / QA** — register `tests/domain-core/run.ts` in the CI test runner once that runner
   is under WP-00's control.
2. **WP-03** — resolve F-2 with a preview/export parity run (`audit/repro-transform-order.mts`),
   then adopt `transform.ts`.
3. **WP-11** — resolve F-1/F-1b and decide Q1 (F-3) as the duration authority.
4. **WP-08** — delete the dead models (rows 9–10), adopt rows 1–8, rename row 12.
