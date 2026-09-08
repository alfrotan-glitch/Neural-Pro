# Invariant Register

**Normative.** An invariant is a property that must hold in the executing system. Each entry
names its executable verification. An invariant with no verification is **UNVERIFIED** and
cannot support a certification claim.

Legend — **Status:** `PASS` (verified executably) · `FAIL` (verified executably, violated) ·
`BLOCKED` (verification cannot run in this environment) · `UNVERIFIED` (not yet checked).

| ID | Invariant | Verification | Class | Owner WP | Status | Evidence |
|---|---|---|---|---|---|---|
| **INV-001** | `totalDuration` is always `calculateProjectDuration(tracks)`; never written independently | Unit: mutate tracks via every command, assert `totalDuration === calculateProjectDuration(tracks)`; assert `setTotalDuration` ignores its argument | executable | WP-08 | **PASS** | `useProjectStore.setTotalDuration` recomputes; `assertValidProjectState` runs on every command |
| **INV-002** | Export never depends on the Preview DOM | Test: export a multi-clip project **with Preview unmounted** → completes, all frames drawn; lint bans `document.querySelector` outside `src/infra/**` | executable + static | WP-02 | **FAIL** | `ExportMediaRegistry.scanForExportFromPlayer` uses `document.querySelectorAll`; 795/1350 frames unresolvable (D-001) |
| **INV-003** | Preview and Export produce identical semantic render plans (geometry, transform, clip, active set, fps, z-order) | `audit/repro-transform-order.mts`, `repro-media-cover-clip.mts`, plus a property test over the transform grid | executable | WP-03 | **FAIL** | transform drift 662.019 px; overflow 991.7 / 279.6 / 153.0 px (D-004, D-005) |
| **INV-004** | Every clip referenced by an export is independently resolvable from `AssetId` | Test: build the export request from a snapshot, assert every clip resolves without a DOM | executable | WP-02 | **FAIL** | only the playhead-active clip is registered |
| **INV-005** | The client cannot influence AI model, system instruction, or generation config | Static: no model id outside `server/config/models.ts`; executable: POST a crafted body ⇒ 400 | static + executable | WP-01 | **FAIL** | `server.ts:232` `ai.models.generateContent(req.body)` (D-002, reproduced) |
| **INV-006** | No privileged server operation is reachable unauthenticated, in **any** environment | Executable: for each privileged route, request with no token ⇒ 401 in dev **and** production | executable | WP-01 | **FAIL** | auth gated on `NODE_ENV==='production'` (D-003, reproduced) |
| **INV-007** | Every workflow run reaches a terminal state (success, failure, cancel, timeout) | Test: cancel/fault at every step of every workflow ⇒ terminal within `graceMs` | executable | WP-04 | **FAIL** | D-010: cancelled queued job runs; cancelled running job stays `rendering` (reproduced) |
| **INV-008** | Every acquired resource is released on every terminal path | Balance probe (object URLs, timers, listeners, encoders, frames, contexts) over success/failure/cancel/timeout/unmount | executable | WP-11 | **FAIL** | D-014 (0 revokes in `App.tsx`), D-016 (199 stale handlers), audio-extraction URLs, `AudioContext` |
| **INV-009** | No durable state depends on a transient identifier (blob URL, data URL, index, path) | Test: serialise a project after uploading media; assert no `blob:`/`data:` string; reload and resolve | executable | WP-05 | **FAIL** | D-006: `blob:` URLs persisted to `localStorage` |
| **INV-010** | An AI failure never appears as successful AI output | Executable: for each failure mode (no key, 429, timeout, malformed, safety) assert non-2xx + typed code; assert UI shows it | executable | WP-09 | **FAIL** | `server.ts:216,236`; 1.00 s of silence; hard-coded "API Connected" (D-009) |
| **INV-011** | A media-backed clip's duration is the **measured** asset duration | Test: import a synthetic 12.345 s asset ⇒ clip duration 12.345; generate audio ⇒ clip duration equals decoded duration | executable | WP-11 | **FAIL** | D-024: `duration = trim.out = previous totalDuration`; defaults 30.0/10.0 |
| **INV-012** | Exactly one component seeks a given media element at a time | Test: start preview, start export, assert no interleaved seeks; architecture test that pool elements are never registered with `multiMediaSyncController` | executable | WP-02 | **FAIL** | export seeks the same nodes as preview, guarded only by `isExporting` |
| **INV-013** | A render pass uses exactly one fps authority | Test: set fps=24, assert frame count, encoder framerate, timestamps and caption timecodes all use 24 | executable | WP-11 | **FAIL** | three fps sources (D-020) + `DEFAULT_CAPTION_FPS=30` (D-022) |
| **INV-014** | No stale non-terminal state survives a restart | Test: kill mid-run, restart, run recovery ⇒ every prior run is terminal, no leaked resources | executable | WP-10 | **UNVERIFIED** | no recovery mechanism exists |
| **INV-015** | `src/domain/**` is pure: no React, DOM, fetch, timers, storage | Static AST test over `src/domain/**` | static | WP-08 | **UNVERIFIED** | `src/domain/**` does not exist yet |
| **INV-016** | No secret reaches the client bundle | Build-time test: `grep -E 'AIza\|GEMINI_API_KEY=' dist/**` ⇒ empty; assert `vite.config.ts` `define` has no secret | static | WP-07 | **PASS** (value) / **FAIL** (mechanism) | values clean; `define` mechanism present (D-021) |
| **INV-017** | Authorisation is never conditional on the environment | Static: no `NODE_ENV` inside an auth guard; executable: dev-mode request ⇒ 401 | static + executable | WP-01 | **FAIL** | `server.ts` export auth gated on production |
| **INV-018** | Code contains no host-specific absolute path or fixed port | Static: no `"/tmp/…"`, `localhost`, `127.0.0.1`, literal `3000` in `src/**` outside dev config; `PORT` from env | static | WP-07 | **FAIL** | 6 × `/tmp/session_…` (D-023); `const PORT = 3000` (D-015) |
| **INV-019** | A renderer cannot mutate project state | Static: `CanonicalRenderPlan` is `readonly`; test: render 100 frames, assert the snapshot is deep-equal before/after | static + executable | WP-03 | **UNVERIFIED** | |
| **INV-020** | No failure is silently swallowed | Static: `catch` blocks must log or rethrow (lint rule); executable tests for each known failure | static + executable | WP-09 | **FAIL** | `catch { return simulated }`, empty catches, `console.error(String(e))` |

## Runtime invariants (AI Studio)

The target-runtime invariants live in
[../contracts/AI-STUDIO-RUNTIME-INVARIANTS.md](../contracts/AI-STUDIO-RUNTIME-INVARIANTS.md)
(**AS-INV-01 … AS-INV-15**): runtime, secret, AI, export, media, persistence, failure,
workflow, capability-detection, server-scope, bounded-operations, dual-context, manifest,
delivery-honesty and no-external-prerequisite.

Those invariants are **additive** and take precedence for any question about the target
runtime. As of 2026-09-09: **2 PASS** (static properties), **7 FAIL**, **6 UNVERIFIED**.
None is BLOCKED — the unverified ones require execution inside Google AI Studio (WP-13).

## Verification execution rules

1. An invariant is only `PASS` when its named verification **ran** and produced a passing
   result in this session or in CI. A claim without a run is `UNVERIFIED`.
2. `BLOCKED` is used only when the environment prevents execution (e.g. no browser for pixel
   parity), and must name the missing capability.
3. Static verification is acceptable **only** where execution is impossible (INV-015, INV-016,
   INV-017, INV-018) and must be labelled as such everywhere it is cited.
4. No invariant may be marked `PASS` by editing this table alone.
