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
| What is the source asset's duration? | `duration.getMediaIntrinsicDuration(clip)` | the **asset's** duration; **never** a bound on the clip |
| How much source media may a clip consume? | `duration.getTrimDuration(clip)` | **the trim window** (`trim.out − trim.in`) — F-3 decision 2026-09-09; `null` = unbounded |
| What is the clip's effective duration? | `duration.getEffectiveClipDuration(clip)` | trim duration ÷ playback rate |
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

## 3.1 Duration vocabulary (F-3 decision, 2026-09-09)

```
media intrinsic duration   ── the ASSET's duration (validation only, never a clip bound)
        │
trim duration              ── trim.out − trim.in        ◄── THE canonical source duration
        │  ÷ playbackRate
effective clip duration    ── trim duration / rate
        │  min(declared, …)
timeline duration          ── what the clip occupies    ◄── the only value the editor renders
```

One function per concept, no aliases. The old `getSourceDuration` — which answered two different
questions depending on whether persisted metadata existed — is removed rather than aliased.

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
| executable | `npx tsx tests/domain-core/run.ts` | `CANONICAL_CORE=PASS` (15 suites, 93 exported values covered) |
| executable | `npx tsx tests/domain-core/run.ts` → `parity` | the kernel agrees with every module that executes today, and every divergence (F-1, F-1b, F-3) is pinned |
| static | `tests/domain-core/purity.test.ts` | `src/domain/**` is pure (INV-015) — platform-API purity only |
| static | `tests/domain-core/boundaries.test.ts` | no edge leaves `src/domain/**`, and the adoption state is reported (INV-027) |
| static | `tests/domain-core/shims.test.ts` | every SHIM marker in `src/domain/**` is registered, owned, time-boxed and not expired (ADR-013) |
| static | `tests/domain-core/coverage.test.ts` | every exported **value** of `src/domain/core/**` is referenced by a test (INV-029) |
| static | `npx tsc --noEmit` | exit 0 |
| regression | `npm test` | exit 0 (`PHASE9_TEST_SUITE=PASS`) — **no production module imports the kernel yet, so no behaviour could change** |

Per ADR-000 the regression row is a *regression* check, not evidence of correctness; the rows
above are the evidence.

**The guard suites are proven non-vacuous.** Each was verified by an injected negative control
(run in an isolated copy outside the repository, then discarded). All seven produced `[FAIL]`
and exit 1:

| # | Injected violation | Suite that caught it |
|---|---|---|
| 1 | unregistered `SHIM-999` marker | `shims` |
| 2 | marker whose milestone disagrees with the register | `shims` |
| 3 | import that leaves `src/domain` | `boundaries` |
| 4 | `document.querySelector` inside the domain layer | `purity` |
| 5 | shim whose removal milestone had shipped | `shims` |
| 6 | exported function no test references | `coverage` |
| 7 | `assertUsableId` regressed to a plain `Error` | `identity` |

### CI registration facts (for WP-00 / QA)

The suite is ready for formal registration in the CI test runner. Verified, not assumed:

| Property | Evidence |
|---|---|
| Command | `npx tsx tests/domain-core/run.ts` (`tsx` is an existing devDependency; no new dependency) |
| Success exit code | `0`, with `CANONICAL_CORE=PASS` on the last line |
| Failure exit code | **1**, with a `[FAIL] <suite>: <message>` line per failing suite and `CANONICAL_CORE=FAIL`. Proven with an injected failing suite (negative control, run outside the repository) |
| Machine-readable summary | `CANONICAL_CORE_SUITES=<n> PASSED=<n> FAILED=<n>` |
| Non-vacuity | the guard suites (purity, boundaries, shims, coverage, identity) were each proven to fail on an injected violation — see above |
| Deterministic | two consecutive runs produced **byte-identical** output |
| Working directory | independent — verified by running from `/tmp` with an absolute path |
| Network / browser / env | none. No `fetch`, no browser, no `process.env`, no clock |
| Ordering | fixed declaration order; no suite depends on another |
| Runtime | Node 22 (`engines: >=20.18 <23`), no build step required |

Not yet done (owned by WP-00/QA): registration in `tests/phase9/test-runner.cjs` and the
corresponding `package.json` script. Both files are outside Core Architecture's ownership, so
they were not modified.


## 8. Findings owned elsewhere

| ID | Finding | Owner |
|---|---|---|
| F-1 / F-1b | `NaN` propagation in `mediaTimeMapper.projectTimeToSourceTime` and `projectDuration.clampProjectTime` | WP-11 |
| F-2 | Preview emitter uses `T·S·R`; the canonical order is `T·R·S` (diverges for `scaleX ≠ scaleY` with rotation — the D-004 case) | WP-03 |
| F-3 | **DECIDED 2026-09-09.** Canonical clip source duration is the **trim window**; persisted media metadata is redefined as the asset's intrinsic duration. Canonical core updated; **downstream integration is WP-11's** | WP-11 (integration) |
| F-4 | Two `getVisible…TimeRange` implementations disagree by the 160 px track header | WP-08 / WP-11 |
