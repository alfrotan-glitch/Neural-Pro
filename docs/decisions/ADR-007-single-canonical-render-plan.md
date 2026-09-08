# ADR-007 — One Canonical Render Plan, Two Renderers

**Status:** Accepted
**Date:** 2026-09-08

## Context

Two renderers exist with divergent semantics:

| Aspect | Preview | Export | Consequence |
|---|---|---|---|
| Transform order | `T·S·R` | `T·R·S` (canvas call order) | **D-004**: 662 px drift with `scaleX≠scaleY` and `rotation≠0` |
| Clipping | `overflow-hidden` | none in the video/image branch | **D-005**: up to 991.7 px of unclipped overflow |
| Active clip set | atomic render snapshot | **recomputed** (`renderSnapshot` is `undefined`) | the parity/diagnostics subsystem (19 files / 2 087 LOC) is skipped |
| fps | `metadata.fps` / React `exportFps` / `activeSettings.fps` | settings fps | **D-020** |

Parity is currently asserted only by a subsystem that never executes.

## Decision

1. `buildCanonicalRenderPlan(snapshot, time, fps, mediaResolver)` is the **only** producer of
   render plans; both renderers consume its output.
2. The transform matrix is produced by exactly one function
   (`getCanonicalTransformMatrix`, order `T·R·S`) and **preview CSS is derived from that
   matrix** rather than hand-written.
3. Clipping is part of the plan (`clipPath` + `radius`) and is applied by both renderers.
4. The `renderSnapshot` produced by the compositor index is threaded into export, so the
   atomic snapshot (and therefore the diagnostics gate) is actually used.
5. One fps authority threads into frame count, encoder config, timestamps and caption
   timecodes.
6. Permitted differences between renderers are limited to antialiasing, text hinting and
   colour rounding — declared, not discovered.

## Consequences

* D-004, D-005, D-020 close; the parity subsystem becomes reachable (or is deleted if proven
  redundant after the fix — decided by measurement, not preference).
* Parity becomes testable at the semantic level (L1) without a browser.
* The Preview's transform CSS changes by construction; every preview layout test must be
  re-run and any visual diff justified by the (now-shared) matrix.

## Alternatives considered

* **Make export match preview's `T·S·R`** — rejected: the canvas order `T·R·S` is the
  behaviour an editor user expects for a rotated, non-uniformly scaled box; the *preview* is
  the one that must be derived from the matrix. Either choice is defensible; choosing one
  authority is the point.
* **Keep two code paths and add a bigger parity gate** — rejected: a gate that never runs did
  not prevent 662 px of drift.
