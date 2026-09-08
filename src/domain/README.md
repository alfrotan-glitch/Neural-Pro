# `src/domain/**` — the domain layer (L2)

**Owner:** Core Architecture (Principal Architect).
**Status:** kernel landed (`src/domain/core/**`); relocation of the existing authorities is
staged and owned (see `docs/decisions/ADR-017-canonical-core.md`).

## What lives here

Pure domain code. No React, no DOM, no `fetch`, no timers, no storage, no `Math.random`,
no `Date.now` (ADR-012, INV-015).

```
src/domain/
  core/            ← the canonical kernel (this is the source of truth)
    errors.ts         DomainInvariantError + codes
    identity.ts       UUID, ProjectId, AssetId, TrackId, ClipId, SourceId, id predicates
    fps.ts            the single fps authority (INV-013)
    time.ts           Seconds, FrameIndex, frame projection, half-open intervals
    duration.ts       playback rate, source range, clip/project duration, time mapping
    geometry.ts       Size/Rect, the 85 % media frame, fit modes
    transform.ts      CanonicalTransform, canonical T·R·S matrix and CSS
    clip.ts           PersistedClip → CanonicalClip, media kind
    track.ts          TrackKind vs LaneRole, track state
    project.ts        CanonicalProject, derived totalDuration
    validation.ts     atomic predicates
  assets/           ← WP-05 (AssetRegistry interface + AssetId consumer)
  (time|render|project)/** ← staged relocations, owned by WP-03 / WP-08 / WP-11
```

## Rules

1. **`src/domain/core/**` imports only `src/domain/core/**`.** No edge to `features/**`,
   `components/**`, `store/**`, `core/**` or `server/**`. This is what kills violation V1.
2. **One definition per concept.** If a concept already exists in `core/`, importing it and
   re-exporting it is correct; re-declaring it is not.
3. **Derived values are never stored.** `totalDuration`, `effectiveDuration` and frame indices
   are computed, not written.
4. **Total normalisers.** `normalizeClip`, `normalizeProject`, `canonicalTransform` and
   `normalizeFps` never throw and never emit a non-finite value. Validation that must fail
   loudly uses the `assert*` predicates and throws `DomainInvariantError`.
5. **Tests are executable**, not grep: `npx tsx tests/domain-core/run.ts`.
   Exit `0` + `CANONICAL_CORE=PASS`; exit `1` + a `[FAIL] <suite>` line per failure.
   Deterministic, cwd-independent, no network/browser/env. CI registration facts:
   `docs/architecture/canonical-core.md` §7.

## Staged duplicates (registered, time-boxed — ADR-013)

| ID | Duplicate | Owner | Remove by |
|---|---|---|---|
| SHIM-006 | `LaneRole` also declared as `TimelineTrackLaneRole` in `features/.../project/types/project.ts` | Core Architecture | WP-08 |
| SHIM-007 | Duration/time/transform/geometry authorities still executing in `core/engine/**` and `features/**` | Core Architecture | WP-12 (each adopting WP may move earlier) |

Expiry for the core-owned shims is enforced **executably** by
`tests/domain-core/shims.test.ts`: it cross-checks every `SHIM-00X owner=… remove=… reason=…`
marker in `src/domain/**` against the ADR-013 register and fails when a removal milestone has
shipped. ADR-013 also names `tests/static/shim-expiry.test.ts` as the global expiry suite; that
file does not exist yet (WP-00/QA), so the core enforces its own shims in the meantime.

Duplicates are permitted **only** for the duration of the staging window.
