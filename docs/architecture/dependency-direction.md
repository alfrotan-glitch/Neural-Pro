# Dependency Direction

**Status:** current (inverted, with cycles) + repair order.

---

## 1. The cycle, precisely

`src/features/video-studio/playback/services/mediaTimeMapper.ts` imports
`getCanonicalClipTimelineDuration` from `src/core/engine/clipTimelineDuration.ts`.
`src/core/engine/projectDuration.ts` imports `Track` from
`src/features/video-studio/project/types/project.ts`.
`src/core/engine/render/CanvasExportRenderer.ts` imports from
`src/features/video-studio/playback/{compositor,services}/**`.

So `core → features` and `features → core`. It compiles because TypeScript resolves either
way and the entry graph is acyclic *per file*, but the **layer** graph is cyclic, which is why
`clipTimelineDuration.ts` exists as a hand-copied "dependency-light" duplicate — the codebase
worked around its own cycle rather than removing it.

`server.ts → src/features/video-studio/captions/services/captionTimecodeService.ts` adds a
server → browser-feature edge (harmless today only because that module is pure).

## 2. Import graph (module level, current, simplified)

```
                    ┌──────────────────┐
                    │  src/App.tsx     │
                    └────────┬─────────┘
                             │
        ┌────────────────────┼─────────────────────┐
        ▼                    ▼                     ▼
  components/         features/video-studio     store/
  (VideoPlayer,       (timeline, playback,      (project, history,
   Virtualized        export, captions,          export, subscribe)
   Timeline,          animation, project)
   Inspector)              │   ▲
        │                  │   │
        └──────────────────┼───┘
                           ▼   │
                     core/engine ────┐   (CanvasExportRenderer, RenderPipeline,
                           ▲         │    projectDuration, CaptionRenderer)
                           └─────────┘        ← CYCLE with features/**

  server.ts ─► src/features/…/captions/services/captionTimecodeService.ts
```

## 3. Repair order (WP-08 — do this only after contracts stabilise)

**Step 1 — extract the domain core (no behaviour change).**
Move to `src/domain/`:

| From | To |
|---|---|
| `features/.../project/types/project.ts` | `domain/project/types.ts` |
| `core/engine/clipTimelineDuration.ts` | `domain/time/clipDuration.ts` |
| `features/.../playback/services/mediaTimeMapper.ts` | `domain/time/mediaTime.ts` |
| `core/engine/projectDuration.ts` | `domain/time/projectDuration.ts` |
| `features/.../playback/services/clipTransformModel.ts` | `domain/render/transform.ts` |
| `features/.../playback/services/mediaFrameGeometry.ts` | `domain/render/geometry.ts` |
| `features/.../playback/compositor/**` | `domain/render/compositor/**` |
| `features/.../playback/services/mediaVisualEffects.ts` | `domain/render/effects.ts` |

Re-export shims at the old paths for one WP, removed in WP-12 (shim removal is a tracked
ticket, per ADR-006).

> **Layout update (2026-09-09, ADR-017).** The L2 destination now exists as a single cohesive
> kernel: **`src/domain/core/**`** (`identity`, `fps`, `time`, `duration`, `geometry`,
> `transform`, `clip`, `track`, `project`, `validation`, `errors`). The per-area target paths in
> the table above remain the right *public* locations, but each should **re-export the kernel**
> (`export * from '../core/duration'`) rather than hold a second implementation — which is this
> document's own migration mechanism. The nine concepts are mutually dependent, so splitting the
> kernel into nine files would have reproduced the `core ↔ features` cycle one layer down.
> Full mapping: [../decisions/ADR-017-canonical-core.md](../decisions/ADR-017-canonical-core.md)
> §"Layout reconciliation".

**Step 2 — break the store cycle.**
`useHistoryStore` must not import `useProjectStore`. Introduce
`app/history/CommandHistory` as a plain class; the project store subscribes to it through a
callback registered at composition time (`src/app/composition.ts`).

**Step 3 — server boundary.**
`server/` may import `src/domain/**` only. Caption timecode logic moves to
`domain/captions/timecode.ts`, imported by both server and features.

**Step 4 — infrastructure behind interfaces.**
`ExportMediaPool`, `AssetRegistry`, `AiGateway`, `Logger` become interfaces in
`domain/**`; implementations live in `infra/**` and are injected at composition time.

**Step 5 — enforce.**
Turn on the lint rules from [module-boundaries.md](module-boundaries.md) §4 and fix the
remaining edges.

## 4. Non-goals

* No microservices, no message broker, no distributed database (per the no-over-engineering
  rule). This is a single SPA + a single stateless server.
* No barrel-file purge for its own sake; barrels are fine at layer roots.
* No rewrite of `TextInspectorPanel`, `VirtualizedTimeline` or `VirtualizedTimeline`'s
  controllers during dependency repair — see
  [../execution/agents/WP-08.md](../execution/agents/WP-08.md).

## 5. Verification

| Check | Method |
|---|---|
| No cycle at layer level | static graph test over `src/domain`, `src/app`, `src/infra`, `src/ui` |
| Domain is pure | static test: no `react`, `window`, `document`, `fetch`, timers in `src/domain/**` |
| Server boundary | static test: no `server/**` import outside `src/domain/**` and `src/server/**` |
| No behaviour change | the full regression suite must pass unchanged after each step |
