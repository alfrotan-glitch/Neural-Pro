# Risk Register

Machine-readable summary table, then one section per risk with detail.

**Severity:** `P0` (product-breaking / security-critical) · `P1` (major) · `P2` (moderate) ·
`P3` (minor)
**Probability:** `High` · `Medium` · `Low`
**Status:** `OPEN` · `MITIGATING` (work in progress) · `CLOSED` (verified) · `ACCEPTED`
(residual, accepted) · `DISPROVED` (hypothesis tested and rejected)

---

## Summary

| ID | Risk | Sev | Prob | Impact | Owner WP | Verification | Status |
|---|---|---|---|---|---|---|---|
| R-001 | Export renders placeholder frames because media is scraped from the Preview DOM | P0 | High | 58.9 % of frames wrong | WP-02 | `repro-export-registry.mts` → 0 | OPEN |
| R-002 | Anonymous caller makes arbitrary metered Gemini calls | P0 | High | unbounded billing, instruction override | WP-01 | executable abuse test | CLOSED |
| R-003 | Anonymous caller triggers server file writes and process spawn | P0 | High | RCE-adjacent, disk exhaustion | WP-01 | route-absence + auth test | CLOSED |
| R-004 | AI failures surface as successful fabricated output | P1 | High | users ship fake content | WP-09 | failure-mode test matrix | CLOSED |
| R-005 | Export/preview transform divergence | P1 | High | 662 px visual mismatch | WP-03 | `repro-transform-order.mts` → 0 | OPEN |
| R-006 | Export does not clip cover-scaled media | P1 | High | up to 991.7 px overflow | WP-03 | `repro-media-cover-clip.mts` → 0 | OPEN |
| R-007 | Uploaded media lost on reload (blob URLs persisted) | P1 | High | data loss | WP-05 | save/reload/restore test | **CLOSED** |
| R-008 | Export cancellation is broken | P1 | High | stuck jobs, wasted renders | WP-04 | `repro-export-queue.mts` → 0 | OPEN |
| R-009 | Generated audio truncated to the previous project duration | P1 | Medium | 15 min → 45 s export | WP-11 | duration-authority test | OPEN |
| R-010 | Test suite provides no behavioural assurance | P1 | High | regressions invisible | WP-06 | suite composition test | OPEN |
| R-011 | Resource leaks (object URLs, handlers, contexts) | P1 | High | tab crash, unsaved work | WP-11 | balance probe | OPEN |
| R-012 | `ondequeue` handler accumulation during back-pressure | P1 | Medium | memory growth, stall | WP-11 | `repro-ondequeue-leak.cjs` → 0 | OPEN |
| R-013 | Environment-conditional authorisation | P1 | Medium | auth bypass outside prod | WP-01 | dev-mode auth test | CLOSED |
| R-014 | Three competing export dispatch authorities + polling orchestrator | P2 | Medium | latent double-dispatch / stuck queue | WP-04 | `repro-queue-deadlock.mts` (guard, currently 0) | OPEN |
| R-015 | ~~Hard-coded port breaks Cloud Run deploy~~ **RECLASSIFIED 2026-09-09**: `3000` is the **AI Studio convention**; the app runs there today. Retained as a **portability** defect for optional external deployment | **P2** (was P1) | Low | external deploy only | WP-07 | `process.env.PORT ?? 3000` + optional container boot | OPEN |
| R-016 | `better-sqlite3` breaks `npm install` | P1 | High | no reproducible install | WP-07 | `npm ci` in a clean container | OPEN |
| R-017 | No error boundary ⇒ invariant throw = white screen | P1 | Medium | total UI loss | WP-07 | boundary test | OPEN |
| R-018 | Two fps authorities + hard-coded caption fps | P2 | High | wrong frame counts, wrong timecodes | WP-11 | fps-authority test | OPEN |
| R-019 | Layer cycle `core ↔ features` and store cycle | P2 | High | duplicated logic, fragile refactors | WP-08 | layer-graph test | OPEN |
| R-020 | UI owns workflow semantics (480-line effect) | P2 | High | untestable, closure-stale logic | WP-04 | workflow tests | OPEN |
| R-021 | Parity/diagnostics subsystem never executes | P2 | High | false assurance | WP-03 | coverage of the gate | OPEN |
| R-022 | Hard-coded Persian UI strings and prompts | P2 | Medium | unusable for other locales | WP-12 | script-detection test | OPEN |
| R-023 | No retry/timeout on AI calls | P2 | Medium | indefinite hangs | WP-09 | timeout test | CLOSED |
| R-024 | Non-deterministic persisted state (`Math.random()` ids/waveforms) | P2 | Medium | unstable undo/diff/tests | WP-12 | determinism test | OPEN |
| R-025 | No CI, no lint, no Dockerfile, no deploy docs | P2 | High | unrepeatable verification | WP-07 | CI green | OPEN |
| R-026 | Browser capability requirements undeclared | P2 | Medium | silent export failure | WP-07 | capability probe test | OPEN |
| R-027 | Waveform/audio render sample-rate mismatch | P2 | Low | pitch/-speed errors | WP-11 | sample-rate test | OPEN |
| R-028 | Repo hygiene: 9 scratch files, `name:"react-example"` | P3 | Low | confusion, false signals | WP-12 | clean-tree test | OPEN |
| R-029 | Pixel-level parity unproven | P1 | Medium | undetected visual drift | WP-06 | browser parity suite | BLOCKED |
| R-030 | Live Gemini behaviour unverifiable in this environment | P2 | Medium | model/response assumptions untested | WP-09 | live-service run | BLOCKED |
| R-031 | Concurrent/parallel export promise not honoured | P2 | Low | user confusion | WP-04 | concurrency test | OPEN |
| R-032 | Export queue lost on reload (jobs are in-memory only) | P3 | Medium | user confusion | WP-10 | documented limitation + test | ACCEPTED (documented) |
| **R-033** | **Export artifact delivery to the browser/user may be blocked inside the AI Studio frame** (`P-01`): the whole deliverable path is `<a download>` + `link.click()` (`VideoStudioPro.tsx:619`, `InspectorEngine.tsx:473`, `ExportToast.tsx:121`, `RenderPipeline.ts:179`) | P1 | Medium | export completes but the user cannot save → silent product failure | WP-04 (fallbacks), WP-13 (verify) | G-31-P/G-31-U AS-15 | **UNVERIFIED** |
| **R-034** | **In-frame storage may be partitioned or denied** (`P-02`) → projects/assets may not survive reload inside AI Studio | P1 | Medium | persistence failure | WP-05 (bundle fallback), WP-13 (verify) | G-31-P/G-31-U AS-08 | **UNVERIFIED** |
| **R-035** | **WebCodecs / OfflineAudioContext availability, initialization, sustained-workload behaviour or undisclosed throttling inside the frame** (`P-03`) — absence of throttling must not be inferred from a small successful test | P1 | Low | export fails or stalls on long projects | WP-07 (probe, optional), WP-13 (verify) | G-31-P/G-31-U AS-09 | **UNVERIFIED** |
| **R-036** | **CSP in the frame may block canvas capture, workers or `media-src`** (`P-04`) | P2 | Low | export/decode failure | WP-13 | G-31-P/G-31-U AS-01, AS-09 | **UNVERIFIED** |
| **R-037** | **Proxy behaviour for long requests and client aborts** (`P-05`) | P2 | Medium | hangs, misleading errors | WP-04 (client-enforced timeouts), WP-13 | G-31/AS-03, AS-12 | **UNVERIFIED** |
| **R-038** | **Dev container ≠ published app** (`P-06`): CPU, memory, timeouts, origin | P1 | Medium | passes in preview, fails when published | WP-13 | G-31-P and G-31-U executed independently | **UNVERIFIED** |
| **R-039** | **No runtime capability detection** (D-030): required browser capabilities are used without probing | P1 | High | obscure failures instead of actionable ones | WP-07 | capability probe tests | OPEN |
| **R-040** | **AI Studio app manifest was unexamined and scheduled for deletion** as a scratch file (D-029) | P1 | High | deleting `metadata.json` would break the AI Studio app contract and its permission model | WP-12 (protect), WP-13 | manifest test | **CLOSED** (corrected 2026-09-09) |
| **R-041** | **Server operations unbounded**: no timeout/retry bound on AI calls; long-running server work is unreliable in the AI Studio runtime (CPU during request processing) | P1 | Medium | hangs, cost, instance pressure | WP-09 | timeout + bounded-retry tests | OPEN |
| **R-042** | **Sharing bills the owner's key**: an unauthenticated or unrestricted AI surface turns every shared user into a cost incident | P0 | High | unbounded billing | WP-01 | operation allowlist + rate limits | OPEN |

---

## Detail

### R-001 — Export media scraped from the Preview DOM
* **Impact:** 795 / 1350 frames (58.9 %) of the default project render with an unresolvable
  active clip; painted as a purple gradient placeholder with the clip name.
* **Evidence:** `ExportMediaRegistry.scanForExportFromPlayer()` →
  `document.querySelectorAll('[data-export-media-clip-id]')`; those nodes come from
  `VideoStudioPro`-driven `VideoPlayer.tsx:497`, mapped over `renderSnapshot.byRole.video`
  (playhead-active only). `audit/repro-export-registry.mts` → exit 1.
* **Mitigations:** ADR-002; `ExportMediaPool` keyed by `AssetId`; detached elements.
* **Owner WP:** WP-02 · **Verification:** `repro-export-registry.mts` exits 0 + headless
  export with Preview unmounted.

### R-002 — Arbitrary metered Gemini invocation
* **Impact:** unbounded billing on the project key; system-instruction override; tool abuse;
  output amplification (≥ 3.9 M output tokens/min/IP at the current limit).
* **Evidence:** `server.ts:232` forwards `req.body` verbatim; reproduced outbound request with
  attacker-chosen `model` and `systemInstruction`.
* **Mitigations:** ADR-005 + ADR-008: operation allowlist, server-owned registry, schema
  validation, per-IP **and** per-token limits, daily budget.
* **Owner WP:** WP-01 · **Verification:** crafted-body request ⇒ 400; model-id containment
  static test.
* **Resolution (2026-09-09, CLOSED):** `/api/generateContent` is gone — `410 Gone` with a
  `SHIM-004` migration note (live `req_408e49f70cbcfb10`). A crafted `{model, config}` body to
  `/api/ai/script` is rejected `400 VALIDATION_FAILED` ("model is not an accepted field"),
  every operation route requires a scoped token, and limits are per-IP **and** per-token
  (30/60 text, 10/20 speech) with `Retry-After` (live 429 `req_863a736a6a8a72f5`).
  Evidence: `tests/server/contract.test.mts`, `resolution-test/security-stage12.cjs`.

### R-003 — Anonymous server-side file write and spawn
* **Impact:** disk exhaustion (7.2 GB/min/IP measured), unauthenticated `spawn`, temp-dir
  pollution; in a multi-tenant host, cross-session file access.
* **Evidence:** anonymous `/api/export/start` created `/tmp/session_<hex>`; `/api/export/finish`
  → `spawn ffmpeg ENOENT`.
* **Mitigations:** ADR-004 removes the route set entirely; ADR-014 forbids env-conditional
  auth for anything that remains.
* **Owner WP:** WP-01 · **Verification:** route-absence test + no `spawn` in `server/**`.
* **Resolution (2026-09-09, CLOSED):** the whole `/api/export/*` set is deleted; all five routes
  answer `410` (live `req_a5ed139387076f7d`). The server imports no `child_process`, calls no
  `spawn`/`exec`, invokes no ffmpeg and writes no `/tmp` path — asserted statically by
  `resolution-test/security-stage12.cjs` (35 assertions) and
  `tests/phaseE-api-route-integrity.cjs` (60 assertions).

### R-004 — Fabricated success
* **Impact:** users receive and ship AI-generated content that was never generated by a model.
* **Evidence:** `server.ts:216,236`; `generateSimulatedContent` returns a canned dialogue and
  `Buffer.alloc(44 + 24000*2)` (1.00 s of silence); no `fallback` flag on
  `/api/generateContent`; hard-coded green badge in `App.tsx`.
* **Mitigations:** ADR-009 + INV-010; typed errors; `/api/health/ai`-driven badge.
* **Owner WP:** WP-09 · **Verification:** five failure modes ⇒ non-2xx with distinct codes.
* **Resolution (2026-09-09, CLOSED):** `generateSimulatedContent`, the 1.00 s silence buffer and
  the hard-coded badge are deleted. A missing key is `503 AI_NOT_CONFIGURED` on all four AI
  routes (live `req_7613a24723778b39`); the badge has four states driven by `/api/health/ai`.
  Client-side TTS validation rejects silent, short, undecodable and format-mismatched audio
  (`tests/unit/ai/validateSpeech.test.mts`). **No simulation flag was implemented:** ADR-009 §4
  permits `AI_ALLOW_SIMULATION` only under three conditions; omitting it satisfies INV-010
  unconditionally and removes the hazard instead of gating it.

### R-005 — Transform divergence
* **Impact:** up to 662 px of position error; every rotated, non-uniformly scaled clip differs
  between preview and export.
* **Evidence:** `audit/repro-transform-order.mts` (exit 1): preview `T·S·R`, export `T·R·S`.
* **Mitigations:** ADR-007; single `getCanonicalTransformMatrix`; preview CSS derived from it.
* **Owner WP:** WP-03 · **Verification:** repro exits 0 + property grid.

### R-006 — Missing clip
* **Impact:** 4:3 → 153.0 px vertical overflow; 9:16 → 991.7 px; 2.39:1 → 279.6 px horizontal.
* **Evidence:** `audit/repro-media-cover-clip.mts` (exit 1).
* **Mitigations:** ADR-007; `clipPath` in the plan; `ctx.clip()` in the video/image branch;
  shared corner-radius constant.
* **Owner WP:** WP-03 · **Verification:** repro exits 0 + aspect-ratio grid.

### R-007 — Uploaded media lost on reload — **CLOSED**
* **Impact (was):** every user-uploaded asset became unresolvable after a refresh; export
  silently rendered placeholders; save reported success.
* **Evidence (was):** `VirtualizedTimeline.handleLinkOrReplaceMediaFile` (~904) and
  `ResourceSidebar.handleFileUpload` (506) assigned `URL.createObjectURL(...)` into clip
  properties, which were serialised to `localStorage`.
* **Mitigations landed:** ADR-006; `AssetId` + IndexedDB (`src/domain/assets/**`,
  `src/infra/persistence/**`); relink UI; export refuses missing assets; a portable
  `.neuralpro` bundle for profiles where in-frame storage is denied or partitioned.
* **Residual:** the IndexedDB *transport* itself is unverified in a real browser (no Chromium
  in this environment) — tracked by WP-06, not by this risk. Object-URL revocation in
  `App.tsx` (D-014) is WP-09 and is a leak risk, not a data-loss one.
* **Owner WP:** WP-05 · **Verification:** `tests/persistence/**` — 10 files, 109 assertion groups;
  save → reload → resolve (`01`, `06`), no `blob:` in documents (`02`, `07`), bundle round trip
  into an empty profile (`08`), measured duration authority (`09`).

### R-008 — Export cancellation broken
* **Impact:** users cannot stop an export; a cancelled job occupies the serialised pipeline.
* **Evidence:** `audit/repro-export-queue.mts` (exit 1): queued job B still executed; job C
  stuck at `rendering`.
* **Mitigations:** ADR-011; workflow runtime; token abort **before** status write.
* **Owner WP:** WP-04 · **Verification:** repro exits 0 + cancel-at-every-step tests.

### R-009 — Generated audio truncated
* **Impact:** a 15-minute podcast exports as 45 s.
* **Evidence:** `VideoStudioPro.tsx:216` `duration = trim.out = state.totalDuration`;
  `getOfflineAudioSourceDuration` clamps to `timelineDuration × playbackRate`.
* **Mitigations:** ADR-010; measure before clip creation; derive the WAV header from the
  decoded buffer.
* **Owner WP:** WP-11 · **Verification:** end-to-end generated-audio duration test.

### R-010 — Non-behavioural test suite
* **Impact:** `npm test` exiting 0 carries no information; regressions ship silently.
* **Evidence:** 191 files, 0 `require` of `src/`, 177 grep-style; two suites read a path that
  is not the executed module (`webcodecs-export.ts` vs `webcodecsExport.ts`).
* **Mitigations:** [../testing/test-strategy.md](../testing/test-strategy.md); T-1…T-7;
  reproductions promoted to regression tests.
* **Owner WP:** WP-06 · **Verification:** suite composition test; every defect has a
  fail-then-pass test.

### R-011 — Resource leaks
* **Impact:** tab memory growth → crash → unsaved work.
* **Evidence:** 0 `revokeObjectURL` in `App.tsx` (D-014); `audioExtractionService` 211/223/234;
  unrevoked URL per `handleLinkOrReplaceMediaFile`; `AudioMixController` context never closed.
* **Mitigations:** INV-008; `AssetRegistry.resolveUrl/releaseUrl`; `RunScope` disposers;
  balance probe.
* **Owner WP:** WP-11 · **Verification:** probe balance zero for all six scenarios.

### R-012 — `ondequeue` handler accumulation
* **Impact:** 199 stale closures per 200 stalled frames; growing memory and spurious wake-ups.
* **Evidence:** `audit/repro-ondequeue-leak.cjs` → exit 1.
* **Mitigations:** restore `previous` on the timeout path; use `addEventListener` with
  `{ once: true }` or an `AbortController`-owned listener set.
* **Owner WP:** WP-11 · **Verification:** repro exits 0.

### R-013 — Environment-conditional authorisation
* **Impact:** auth bypass in every non-production environment, including a misconfigured
  production build.
* **Evidence:** export auth gated on `NODE_ENV === 'production'`.
* **Mitigations:** ADR-014; auth is unconditional; no privileged server route remains.
* **Owner WP:** WP-01 · **Verification:** dev-mode request ⇒ 401.
* **Resolution (2026-09-09, CLOSED):** authorisation is unconditional — `requireSession()` runs
  on every operation route in every environment, with no `NODE_ENV` in any auth guard.
  `tests/server/contract.test.mts` T-02 asserts 401 with `nodeEnv: development` **and**
  `production`; T-05/T-06 cover wrong scope (403) and tampered/expired tokens (401).

### R-014 — Competing export dispatch authorities
* **Impact:** latent double dispatch, stuck queues, unhonoured "parallel" mode.
* **Evidence:** `beginExport()` → `void renderPipeline.renderJob`; `executionTail`;
  `ExportQueueManager` `setInterval(1500)` `runOrchestrator` re-dispatching every `waiting`
  job. **Two deadlock hypotheses were tested executably and disproved**
  (`audit/repro-queue-deadlock.mts` → exit 0): duplicate dispatch is absorbed by the
  `job.status !== 'waiting'` guard, and N parallel jobs over one slot all complete.
* **Mitigations:** ADR-011; one authority; delete the poller; keep the guard script.
* **Owner WP:** WP-04 · **Verification:** single-dispatch architecture test + repro guard.

### R-015 — Hard-coded port and `/tmp` paths
* **Impact:** Cloud Run deploy fails / app unreachable; Windows dev broken.
* **Evidence:** `server.ts:197` `const PORT = 3000`; 6 × `/tmp/session_…`.
* **Mitigations:** `PORT` from env; `os.tmpdir()` + `NEURALPRO_TMPDIR`; the `/tmp` consumer is
  removed by ADR-004.
* **Owner WP:** WP-07 · **Verification:** boot with `PORT=8080` in a container.

### R-016 — `better-sqlite3` breaks install
* **Impact:** `npm install`/`npm ci` fails; no reproducible build; CI impossible.
* **Evidence:** node-gyp build failure; 0 references in 41 k LOC.
* **Mitigations:** remove the dependency; commit a lockfile; `npm ci` in CI.
* **Owner WP:** WP-07 · **Verification:** clean-container `npm ci`.

### R-017 — No error boundary
* **Impact:** any thrown invariant (they are thrown in six validations) unmounts the tree →
  white screen with no recovery.
* **Evidence:** no `ErrorBoundary` anywhere in `src/`; `main.tsx` renders `<App/>` bare.
* **Mitigations:** boundary at the app root + per-panel; offers undo-last-action / restore.
* **Owner WP:** WP-07 · **Verification:** throw in render ⇒ fallback UI shown.

### R-018 — FPS authority split
* **Impact:** frame count, encoder config and caption timecodes can disagree.
* **Evidence:** `exportFps` React state vs `activeSettings.fps` vs `metadata.fps` vs
  `DEFAULT_CAPTION_FPS = 30`.
* **Mitigations:** `RenderFpsAuthority`; `projectFps` mandatory on caption endpoints.
* **Owner WP:** WP-11 · **Verification:** fps propagation test at 24/30/60.

### R-019 — Layer cycles
* **Impact:** duplicated domain logic (`clipTimelineDuration`), fragile refactors, server
  depending on browser feature code.
* **Evidence:** see [../architecture/dependency-direction.md](../architecture/dependency-direction.md)
  V1–V4.
* **Mitigations:** ADR-012; pure `src/domain/**`; store cycle broken by a `CommandHistory`
  class.
* **Owner WP:** WP-08 · **Verification:** layer-graph test + domain-purity test.

### R-020 — UI owns workflow semantics
* **Impact:** stale closures (the two-fps bug), untestable orchestration, no cancellation.
* **Evidence:** `VideoStudioPro.tsx:433-705`; `App.tsx` podcast/TTS; `setInterval` orchestrator.
* **Mitigations:** ADR-003; workflow runtime.
* **Owner WP:** WP-04 · **Verification:** workflow tests run without React.

### R-021 — Unreachable parity subsystem
* **Impact:** 2 087 LOC of parity/diagnostics code provides zero assurance; its existence
  creates false confidence.
* **Evidence:** `renderSnapshotRegressionGate` / `renderSnapshotDiagnostics` only called from
  `exportService.renderExportFrame`, which is never called.
* **Mitigations:** after ADR-007, decide by measurement whether the gate earns its place: if
  the canonical plan makes it redundant, delete it; if it catches real drift, wire it into the
  export path and CI.
* **Owner WP:** WP-03 · **Verification:** either coverage > 0 or files deleted (recorded).

### R-022 — Hard-coded locale
* **Impact:** Persian strings and Persian AI prompts regardless of user language.
* **Evidence:** `server.ts:725`, `:882`; inline UI strings and toasts.
* **Mitigations:** [../operations/i18n.md](../operations/i18n.md); extraction + lint rule +
  script-detection test.
* **Owner WP:** WP-12 · **Verification:** no non-Latin script outside `i18n`/`prompts`.

### R-023 — No retry/timeout on AI calls
* **Impact:** an export/podcast step can hang indefinitely with no user feedback.
* **Evidence:** no `AbortSignal` on server AI calls; only an inline fixed-delay 429 retry for
  TTS.
* **Mitigations:** workflow retry/timeout policies; server-side `AbortSignal.timeout`.
* **Owner WP:** WP-09 · **Verification:** timeout and bounded-retry tests.
* **Resolution (2026-09-09, CLOSED):** the inline TTS retry loop is gone. Retry is bounded
  (3 attempts, exponential 500 ms → 8 s, full jitter) and allowlisted to five codes; timeouts are
  per-step and per-run (`TIMEOUT_POLICIES`) plus per-model upstream timeouts (120/180/60 s).
  Proven by `tests/unit/workflow/lifecycle.test.mts` T-08…T-15.

### R-024 — Non-deterministic persisted state
* **Impact:** unstable ids, noisy diffs, non-reproducible tests, hidden state churn.
* **Evidence:** `Math.random()` caption ids; `waveformData` random per sync and persisted.
* **Mitigations:** content-derived ids; derived or non-persisted waveforms.
* **Owner WP:** WP-12 · **Verification:** determinism test (same input ⇒ same document hash).

### R-025 — No CI / lint / container / deploy docs
* **Impact:** verification is not repeatable; the "green build" claim cannot be checked.
* **Evidence:** no `.github/workflows`, no ESLint config, no Dockerfile, no deploy runbook.
* **Mitigations:** WP-07 adds CI (install, typecheck, lint, test, build, container boot),
  ESLint with boundary rules, and deployment documentation.
* **Owner WP:** WP-07 · **Verification:** CI green on a clean checkout.

### R-026 — Undeclared browser capabilities
* **Impact:** export fails obscurely on unsupported browsers.
* **Evidence:** `VideoEncoder`, `AudioEncoder`, `VideoFrame`, `AudioData`,
  `createImageBitmap`, `OfflineAudioContext`, `structuredClone`, `roundRect` are used with no
  probe.
* **Mitigations:** capability probe; `/api/health` capability list; actionable message.
* **Owner WP:** WP-07 · **Verification:** capability-probe unit test + manual matrix.

### R-027 — Sample-rate mismatch
* **Impact:** wrong pitch/speed or silent resampling.
* **Evidence:** `OfflineAudioContext(2, len, 44100)` at the call site vs
  `audioBuffer.sampleRate` for the encoder; hard-coded 24 kHz WAV header.
* **Mitigations:** one `AudioRenderSampleRate` authority with an explicit resample step.
* **Owner WP:** WP-11 · **Verification:** sample-rate propagation test.

### R-028 — Repository hygiene
* **Impact:** false signals for agents and reviewers; unprofessional artefact.
* **Evidence:** 9 scratch files at the root; `package.json` `name: "react-example"`.
* **Mitigations:** delete scratch files; rename the package; add root-file allowlist test.
* **Owner WP:** WP-12 · **Verification:** clean-tree test.

### R-029 — Pixel-level parity unproven
* **Impact:** semantic parity may pass while pixels differ (filters, text, rounding).
* **Evidence:** **BLOCKED** — no browser runtime provisioned in this environment.
* **Mitigations:** Playwright + `pixelmatch` suite with declared tolerances.
* **Owner WP:** WP-06 · **Verification:** L2 report with `status` ≠ `UNVERIFIED`.

### R-030 — Live Gemini behaviour unverifiable here
* **Impact:** model-id validity, TTS sample rate/channels and response shapes are assumed.
* **Evidence:** **BLOCKED** — no egress to `generativelanguage.googleapis.com` from this
  environment. **This is an environment blocker, not a pass.**
* **Mitigations:** record-and-replay fixtures committed to the repo; one live smoke run during
  WP-10 runtime certification, in an environment with egress.
* **Owner WP:** WP-09 / WP-10 · **Verification:** live-service run recorded with request ids.
* **Status note (2026-09-09):** still **BLOCKED** for live Gemini traffic — this sandbox has no
  egress. Everything that does not need egress is now verified executably (failure mapping with
  an injected transport, schema rejection, auth, rate limits) and against the real server over
  localhost; see `docs/execution/evidence/wp-01-wp-04-wp-09-verification.md` §1b.

### R-031 — "Parallel" export mode not honoured
* **Impact:** user selects parallel, gets serial; queue appears stalled.
* **Evidence:** `processMode === 'parallel'` in UI; `RenderPipeline` serialises on
  `executionTail`.
* **Mitigations:** ADR-011; explicit `maxConcurrentExports`; remove the option if not
  supported.
* **Owner WP:** WP-04 · **Verification:** concurrency test at N=1 and N=2.

### R-032 — Export queue lost on reload
* **Impact:** jobs disappear on refresh; a long export cannot outlive a reload.
* **Evidence:** jobs live only in `useExportStore` (in-memory).
* **Decision:** **ACCEPTED for v1**, documented in
  [../architecture/export-architecture.md](../architecture/export-architecture.md) §5 and
  surfaced in the UI ("exports do not survive a page reload"). Persisting a *browser-side*
  render job across reloads is not possible without the media pool, so the honest answer is a
  documented limitation plus a clean terminal state on unload.
* **Owner WP:** WP-10 · **Verification:** unload ⇒ every run reaches a terminal state.
| **R-043** | **Non-deterministic verification fixture**: remote media, prior Blob URLs, random waveforms, timestamps or unstable AI output would make WP-13 results unreproducible and could mask a real incompatibility | P1 | Medium | unreproducible evidence; false confidence | WP-13 | deterministic fixture + recorded content hash; `tests/fixtures/determinism.test.ts` | OPEN |
| **R-044** | **False PASS**: a criterion promoted to PASS on static, documentary or inferred evidence (or on a local run) instead of executable evidence in the target context | P0 | High | undetected runtime incompatibility reaches users | WP-13 | evidence-classification gate + `tests/ai-studio/evidenceClassification.test.ts` + mechanical G-31 derivation | OPEN |
| **R-045** | **Context conflation**: Preview and Published results merged into one verdict, hiding a published-app failure | P1 | Medium | failure appears only after users use the app | WP-13 | `G-31-P` / `G-31-U` recorded separately; `tests/ai-studio/gateDerivation.test.ts` | OPEN |
