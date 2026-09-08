# ADR-012 — Four-Layer Module Structure

**Status:** Accepted
**Date:** 2026-09-08

## Context

The dependency graph is cyclic at the layer level:

* `core/engine/render/CanvasExportRenderer.ts` imports six modules from
  `features/video-studio/playback/**`;
* `core/engine/projectDuration.ts` imports `features/video-studio/project/types/project`;
* `features/video-studio/playback/services/mediaTimeMapper.ts` imports
  `core/engine/clipTimelineDuration`;
* `useProjectStore` ↔ `useHistoryStore` are mutually dependent (works only via `getState()`);
* `server.ts` imports a browser-feature module
  (`features/video-studio/captions/services/captionTimecodeService`).

`clipTimelineDuration.ts` exists specifically to avoid this cycle — a hand-maintained
duplicate in the *dependency-light* direction.

## Decision

Adopt four layers with one-way edges:

```
src/ui/**        → React components; rendering and intents only
src/app/**       → workflows, use-cases, commands; orchestration and state machines
src/domain/**    → project, time, transform, compositor, render model; PURE
src/infra/**     → media pools, encoders, IndexedDB, HTTP, logging, AI gateway
server/**        → may import src/domain/** only
```

Allowed edges: `ui → app → domain ← infra`; `infra → domain`.
`src/domain/**` must not import `react`, or reference `window`, `document`, `fetch`,
`localStorage`, `indexedDB`, `setTimeout` or `setInterval`.

Enforcement: `eslint-plugin-boundaries` plus two static tests (no cycles at layer level;
domain purity).

Migration is **mechanical**: files move, re-export shims bridge one work package
(see ADR-013), behaviour is unchanged, and every step must keep the regression suite green.

## Consequences

* The `core/…` ↔ `features/…` cycle disappears; `clipTimelineDuration`'s duplicate becomes the
  single `domain/time/clipDuration.ts`.
* `server/` stops depending on browser feature code.
* Infrastructure (media pools, persistence) becomes replaceable and therefore testable.
* WP-08 moves ~40 files. It must **not** rewrite them.

## Alternatives considered

* **Keep the current tree and add lint rules that describe it** — rejected: the current tree
  has no layer semantics to describe; the cycle is structural.
* **Full rewrite into a new structure** — rejected by the directive's no-rewrite-for-style
  rule; the move is behaviour-preserving.
