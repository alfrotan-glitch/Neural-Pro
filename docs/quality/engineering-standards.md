# Engineering Standards

Normative rules for all code in this repository, including code written by agents.

---

## 1. TypeScript

| Rule | Statement |
|---|---|
| TS-1 | `strict: true` stays on. `any` is banned except with a `// SAFETY:` comment naming the reason. |
| TS-2 | `as unknown as X` requires a justification comment; a type guard is preferred. |
| TS-3 | Public module boundaries export types explicitly; no inferred public API. |
| TS-4 | Discriminated unions over boolean flags for state (`status`, not `isLoading && isError`). |
| TS-5 | Every exported function has a documented contract when it is a canonical authority. |
| TS-6 | No non-null assertion (`!`) on a value that can be absent at runtime — `Map.get()!` included. |

## 2. React

| Rule | Statement |
|---|---|
| R-1 | `useEffect` may **not** contain multi-step business orchestration. One effect = one side effect. |
| R-2 | Long-running operations belong to `WorkflowRuntime`; components subscribe. |
| R-3 | No `setTimeout`/`setInterval` for progress or state machine advancement. |
| R-4 | Derived state is **computed**, never stored and synchronised. |
| R-5 | Every list key is a stable id — never an index, never `Math.random()`. |
| R-6 | Components do not call `document.querySelector`. |
| R-7 | No business logic in `App.tsx` (currently ~1 000 LOC of it). |
| R-8 | State updates are immutable; no direct mutation of store objects (D-018). |
| R-9 | Accessibility: every interactive element has an accessible name; focus is managed on
        modal open/close; keyboard parity for every pointer interaction; colour contrast ≥ 4.5:1. |

## 3. Domain code

| Rule | Statement |
|---|---|
| D-1 | Domain modules are pure: no React, DOM, `fetch`, timers, storage, `Date.now()`, `Math.random()`. |
| D-2 | Domain functions are total: they return a value for every input or throw a typed error. |
| D-3 | One authority per concept. Duplicating a canonical function is a defect, not a workaround. |
| D-4 | Invariants throw in tests; in production they throw into an error boundary. |

## 4. Errors and logging

| Rule | Statement |
|---|---|
| E-1 | Never swallow an error. `catch` must rethrow, return a typed error, or log with context. |
| E-2 | Never return success for a failed operation (INV-010). |
| E-3 | User-facing messages come from `errorCode` → i18n; never from raw upstream text. |
| E-4 | Log structured events (see [../operations/logging.md](../operations/logging.md)); no emoji
        console noise, no localised log strings. |

## 5. Resources

| Rule | Statement |
|---|---|
| RES-1 | Every acquisition has exactly one release site, in a `finally` or a disposer. |
| RES-2 | Object URLs are minted only by `AssetRegistry.resolveUrl`. |
| RES-3 | Timers and listeners are owned by a scope that is disposed on unmount/terminal state. |
| RES-4 | `VideoFrame`, `ImageBitmap`, encoders and `AudioContext` are explicitly closed. |

## 6. Server

| Rule | Statement |
|---|---|
| S-1 | Every route validates its input against a schema before use. |
| S-2 | No client-supplied model id, system instruction, generation config, path, or URL. |
| S-3 | Authorisation is unconditional — never gated on `NODE_ENV`. |
| S-4 | No `spawn`. If ever unavoidable: `shell: false`, argument array, allowlisted binary,
        timeout, no user-controlled arguments. |
| S-5 | Ports from `process.env.PORT`; bind `0.0.0.0`. |
| S-6 | No absolute filesystem paths; use `os.tmpdir()` + `path.join`. |
| S-7 | No secret in a response, a log, or the client bundle. |

## 7. Testing

See [../testing/test-strategy.md](../testing/test-strategy.md). Summary: tests must be
behavioural; defect fixes ship with fail-then-pass tests; no weakening tests; no deleting
defect evidence.

## 8. Style

| Rule | Statement |
|---|---|
| ST-1 | Prettier (2-space, single quotes, semicolons) — mechanical, no debate. |
| ST-2 | Files ≤ 400 LOC where practical; `VideoStudioPro.tsx` (1 855) and `server.ts` (1 172)
        are the two known violations and are decomposed by WP-08 / WP-01. |
| ST-3 | One exported responsibility per module. |
| ST-4 | No `index.ts` barrel that re-exports an entire layer (they defeat boundary checks). |
| ST-5 | Comments explain *why*; the code explains *what*. No comment may state a fact the code
        contradicts (ADR-000). |

## 9. Portability (AI Studio / Cloud Run)

| Rule | Statement |
|---|---|
| P-1 | No `localhost` / `127.0.0.1` / fixed port in `src/**`. |
| P-2 | No POSIX-only paths in `src/**`; `path.join` / `os.tmpdir()` on the server. |
| P-3 | No undeclared system binaries. |
| P-4 | No filesystem writes outside the temp dir; none at all in the browser path. |
| P-5 | No browser API assumed available without a probe. |
| P-6 | No server API called from browser code except through the documented `AiGateway`/HTTP
        contracts. |
| P-7 | No persistent server-side state between requests. |
