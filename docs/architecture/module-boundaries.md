# Module Boundaries

**Status:** target, with current violations enumerated and verified.

---

## 1. Layers

```
┌─────────────────────────────────────────────────────────────────┐
│ L4  UI            React components. Rendering + intents only.   │
│                   No domain rules. No long-running orchestration.│
├─────────────────────────────────────────────────────────────────┤
│ L3  Application   Workflow runtime, use-cases, commands.        │
│                   Orchestrates; owns cancellation/state machines.│
├─────────────────────────────────────────────────────────────────┤
│ L2  Domain        Project/Track/Clip/Asset, duration, transform, │
│                   compositor plan, render model. PURE.           │
│                   No React. No DOM. No fetch. No timers.         │
├─────────────────────────────────────────────────────────────────┤
│ L1  Infrastructure Media pools, encoders, IndexedDB, HTTP,       │
│                   logging, AI gateway. Implements L2 interfaces. │
└─────────────────────────────────────────────────────────────────┘
```

Allowed edges: `L4 → L3 → L2 ← L1`. Infrastructure **implements** domain interfaces
(dependency inversion) and may depend on domain contracts; domain depends on nothing.

## 2. Directory → layer mapping (target)

| Path (target) | Layer | May import |
|---|---|---|
| `src/ui/**` | L4 | `src/app/**`, `src/domain/**` (read), `src/infra/**` (via hooks) |
| `src/app/**` (workflows, commands, use-cases) | L3 | `src/domain/**`, `src/infra/**` (interfaces) |
| `src/domain/**` (project, time, transform, render model) | L2 | `src/domain/**` only |
| `src/infra/**` (media, persistence, http, log, ai) | L1 | `src/domain/**`, platform APIs |
| `server/**` | server | `src/domain/**` **only** (never `src/ui`, never `src/features/**`) |

Today the tree is `src/{components,features,core,store,lib,config,types}` with no layer
separation. **WP-08 moves code into layers; it does not rewrite it.**

## 3. Current violations (verified)

| ID | Violation | Evidence | Repairing WP |
|---|---|---|---|
| V1 | `core/engine/*` imports `features/video-studio/*` | `CanvasExportRenderer.ts:5-12` imports 6 modules from `features/video-studio/playback/**`; `projectDuration.ts:1` imports `features/video-studio/project/types/project` | WP-08 |
| V2 | Circular store dependency | `useProjectStore.executeCommand` ↔ `useHistoryStore.undo/redo` | WP-08 |
| V3 | Server imports browser-feature code | `server.ts:9` imports `src/features/video-studio/captions/services/captionTimecodeService` | WP-07 |
| V4 | Logic duplicated to dodge a cycle | `clipTimelineDuration.ts` header comment admits it exists "without creating a feature/core import cycle" | WP-08 |
| V5 | UI owns workflow semantics | `VideoStudioPro.tsx:433-705` | WP-04 |
| V6 | Infrastructure (DOM scraping) inside the render path | `ExportMediaRegistry.ts` `document.querySelectorAll` | WP-02 |
| V7 | Dead 1-line command stubs in `core/commands` | `propertyCommands.ts`, `cyberpunkSubscribeCommands.ts` | WP-12 |

## 4. Enforcement

1. **Lint:** `eslint-plugin-boundaries` (or `import/no-restricted-paths`) with the table above
   as configuration. Domain layer additionally forbids: `react`, `react-dom`, `document`,
   `window`, `fetch`, `setTimeout`, `setInterval`, `localStorage`, `indexedDB`.
2. **Test:** a static test asserting no file under `src/domain/**` imports React or touches
   `window`/`document`. (This is one of the few legitimate *static* assertions — see
   [../testing/test-strategy.md](../testing/test-strategy.md) §7.)
3. **Review:** [../quality/code-review-policy.md](../quality/code-review-policy.md) requires an
   explicit note for any cross-layer import.

## 5. Feature-module internal structure (preserved)

The existing per-feature layout is good and should be kept:

```
features/video-studio/<feature>/
  ├── types/          domain shapes
  ├── services/       pure functions + coordinators
  ├── commands/       undoable mutations (Command interface)
  ├── selectors/      memoized derivations
  ├── controllers/    React-facing hooks
  └── components/     presentational React
```

`commands/` implementing a uniform `Command { id, name, execute(state), undo(state) }` with
immutable transitions is a genuine strength. Keep it; move it to L3.
