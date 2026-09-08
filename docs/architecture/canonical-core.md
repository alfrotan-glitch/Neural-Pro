# Canonical Core

**Status:** landed (`src/domain/core/**`) — adoption by the owning work packages is staged.
**Authority:** [ADR-017](../decisions/ADR-017-canonical-core.md)
**Owner:** Core Architecture (Principal Architect)

This is the reference for *where a concept is defined*. If a concept appears in two places, the
one named here is authoritative and the other is a staging duplicate with an expiry.

---

## 1. The kernel

```
src/domain/core/
  errors.ts        DomainInvariantError + codes
  identity.ts      UUID · ProjectId · AssetId · TrackId · ClipId · SourceId
  fps.ts           THE framerate authority
  time.ts          Seconds · FrameIndex · frame projection · half-open TimeInterval
  duration.ts      playback rate · source range · clip & project duration · time mapping
  geometry.ts      Size · Rect · the 85 % media frame · FitMode
  transform.ts     CanonicalTransform · canonical T·R·S matrix and CSS
  clip.ts          PersistedClip → CanonicalClip · MediaKind
  track.ts         TrackKind vs LaneRole · TrackState
  project.ts       CanonicalProject · derived totalDuration
  validation.ts    atomic predicates
  index.ts         the only import surface
```

Pure by construction and enforced by `tests/domain-core/purity.test.ts`:

> no React · no DOM · no `fetch` · no timers · no storage · no `Math.random` ·
> no `Date.now` · no `crypto` · no `process.env` · no import outside `src/domain/**`.

## 2. Canonical answers

| Question | Canonical authority | Rule |
|---|---|---|
| What is the framerate for a render pass? | `fps.resolveRenderFps(exportFps, projectFps)` | explicit export fps **>** project fps **>** `DEFAULT_FPS = 30`. Captions derive from the resolved value; there is no caption framerate |
| What unit is project time? | `time.Seconds` | seconds, always. Frames, pixels and microseconds are projections |
| Is a clip active at time T? | `time.intervalContains` over a half-open `TimeInterval` | `[start, end)` — adjacent clips never both render at the boundary |
| How long is a clip on the timeline? | `duration.getTimelineDuration(clip)` | `min(declared, sourceDuration / rate)`; `declared` when the source is unbounded |
| How much source media may a clip consume? | `duration.getSourceDuration(clip)` | images and text are unbounded (`null`); see finding **F-3** |
| What is the project duration? | `duration.calculateProjectDuration(tracks)` | the furthest clip endpoint; **derived**, never written (INV-001) |
| Where does media sit in the frame? | `geometry.mediaFrameGeometry(size)` | 85 % inset, centred — same in preview and export |
| How is source media fitted? | `geometry.fitRect(source, frame, mode)` | `cover` is the executing default (`object-cover` in preview, `max()` scale in export) |
| How is a clip placed? | `transform.canonicalTransform` + `transform.transformMatrix` | `T(origin + x, origin + y) · R(rotation) · S(scale·scaleX, scale·scaleY)` |
| What is a clip? | `clip.PersistedClip` → `clip.normalizeClip` → `clip.CanonicalClip` | persisted is loose (compatible with `ClipNode`); canonical is strict |
| What is a track? | `track.CanonicalTrack` | `kind` = render authority (4 values) · `laneRole` = presentation (13 values). Never branch rendering on `laneRole` |
| What is a project? | `project.CanonicalProject` | `totalDuration` is derived; `withTracks` / `withCurrentTime` recompute and clamp |

## 3. Two shapes, one bridge

```
PersistedClip  (loose, structurally compatible with today's ClipNode)
      │
      │  normalizeClip()   — total: never throws, never emits a non-finite value
      ▼
CanonicalClip  (strict: finite numbers, normalised transform, derived effectiveDuration)
```

Same pattern for tracks (`normalizeTrack`) and projects (`normalizeProject`). Validation that
must fail loudly uses the `assert*` predicates and throws `DomainInvariantError` — it never
silently repairs.

## 4. What is deliberately **not** in the kernel

| Not here | Why |
|---|---|
| Timeline pixel geometry (`timeToPixel`, zoom, scroll) | it is a **view projection** of seconds, i.e. L4 state — not project state |
| React state, stores, commands | L3/L4 |
| Media elements, encoders, IndexedDB, HTTP | L1 infrastructure |
| ID *generation* | needs `crypto` → infrastructure. The kernel brands and validates ids only |
| Workflow/cancellation semantics | owned by WP-04 (`src/app/workflows/**`) |

## 5. Adoption rules

1. **Import, never redeclare.** A module needing `AssetId` imports it from
   `src/domain/core/identity`; it does not declare a second `type AssetId = string`.
2. **One direction.** `src/domain/core/**` imports only `src/domain/**`. Anything that needs
   the kernel imports it; the kernel never imports back. This is what breaks violation V1.
3. **Re-export, don't fork.** An existing authority adopts the kernel by re-exporting it. The
   change is behaviour-preserving and green-lit by the parity suite.
4. **Derived values are never stored.** `totalDuration`, `effectiveDuration` and frame indices
   are computed.

## 6. Staged duplicates (time-boxed)

| ID | Duplicate | Owner | Remove by |
|---|---|---|---|
| SHIM-006 | `LaneRole` also declared as `TimelineTrackLaneRole` in `features/.../project/types/project.ts` | Core Architecture | WP-08 |
| SHIM-007 | duration / time / transform / geometry authorities still executing in `core/engine/**` and `features/**` | Core Architecture | WP-12 (earlier if the adopting WP moves first) |

## 7. Verification

| Class | Command | Result |
|---|---|---|
| executable | `npx tsx tests/domain-core/run.ts` | `CANONICAL_CORE=PASS` (8 suites) |
| executable | `npx tsx tests/domain-core/run.ts` → `parity` | the kernel agrees with every module that executes today, and every divergence (F-1…F-3) is pinned |
| static | `tests/domain-core/purity.test.ts` | `src/domain/**` is pure (INV-015) |
| static | `npx tsc --noEmit` | exit 0 |
| regression | `npm test` | exit 0 (`PHASE9_TEST_SUITE=PASS`) — **no production module imports the kernel yet, so no behaviour could change** |

Per ADR-000 the last row is a *regression* check, not evidence of correctness; the first three
rows are the evidence.

## 8. Findings owned elsewhere

| ID | Finding | Owner |
|---|---|---|
| F-1 / F-1b | `NaN` propagation in `mediaTimeMapper.projectTimeToSourceTime` and `projectDuration.clampProjectTime` | WP-11 |
| F-2 | Preview emitter uses `T·S·R`; the canonical order is `T·R·S` (diverges for `scaleX ≠ scaleY` with rotation — the D-004 case) | WP-03 |
| F-3 | Source duration answers two different questions depending on persisted metadata (quirk Q1) | WP-11 |
| F-4 | Two `getVisible…TimeRange` implementations disagree by the 160 px track header | WP-08 / WP-11 |
