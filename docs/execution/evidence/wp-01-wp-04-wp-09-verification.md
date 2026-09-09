# Verification evidence — WP-01 / WP-04 / WP-09

**Recorded:** 2026-09-09 · **Branch:** `arena/01a082d2-neural-pro` · **Node:** v22.22.3
Recorded per `docs/execution/verification-matrix.md` §4: command, exit code, report path.
A command that was not run is marked `not run`, never as passed with zero cases.

---

## 1. Executed commands

| # | Command | Exit | Result |
|---|---|---|---|
| V-1 | `npx tsc --noEmit` | 0 | clean, 0 diagnostics |
| V-2 | `npm run test:unit` (= `tests/server/*.test.mts` + `tests/unit/workflow/*.test.mts` + `tests/unit/ai/*.test.mts`) | 0 | **88 tests, 88 pass, 0 fail** |
| V-3 | `npm test` (`tests/phase9/test-runner.cjs`, 113 suites) | 0 | `PHASE9_TEST_SUITE=PASS`, 0 `[FAIL]` |
| V-4 | `npm run build` (`vite build` + `esbuild server.ts`) | 0 | `dist/assets/index-*.js` 1 295.32 kB, `dist/server.cjs` 66.7 kb |
| V-5 | `npx tsx audit/repro-export-queue.mts` (unmodified) | **0** | `Defects reproduced: 0` — cases 1, 2, 3 all `ok` |
| V-6 | `npx tsx audit/repro-queue-deadlock.mts` (unmodified) | **0** | `Defects reproduced: 0` (guard still green) |
| V-7 | `node audit/repro-ondequeue-leak.cjs` (unmodified) | 1 | `DEFECT REPRODUCED` — **pre-existing, WP-11 domain** (WebCodecs `ondequeue` closure chain); the script is self-contained and imports nothing owned by WP-01/04/09 |
| V-7b | `npx tsx audit/repro-export-registry.mts` (WP-02) | 1 | not my domain; recorded so G-05 is accurate |
| V-7c | `npx tsx audit/repro-transform-order.mts` (WP-03) | 1 | `Divergent cases: 2/4` — not my domain |
| V-7d | `npx tsx audit/repro-media-cover-clip.mts` (WP-03) | 1 | `Divergent source geometries: 3/4` — not my domain |
| V-8 | `grep -rn "setInterval" src/features/video-studio/export/` | 1 | **0 matches** (WP-04 criterion 4) |
| V-9 | `grep -rn "setInterval" src/app/workflows/` | 1 | **0 matches** (no polling orchestrator, R-014) |
| V-10 | `grep -o 'AIza[0-9A-Za-z_-]\{10,\}' dist/assets/*.js` | 0 hits | no key-shaped literal in the client bundle |
| V-11 | `grep -c 'GEMINI_API_KEY' dist/assets/*.js` | 0 hits | the identifier is not referenced by client code |

**Caveat on V-10/V-11 (honest gap).** No `.env` exists in this sandbox, so
`GEMINI_API_KEY` was empty at build time: these two greps prove the *mechanism* is
gone (the `define` entry was removed from `vite.config.ts`, and
`resolution-test/security-stage12.cjs` asserts it cannot come back), but they are
not a positive control. A build with a real key present has **not** been run here.

## 1b. Live-service check (real server, real HTTP, no egress)

`PORT=8080 HOST=0.0.0.0 npx tsx server.ts` — booted with `aiConfigured:false`,
`sessionSecretConfigured:false` (the ephemeral-key warning was logged as designed),
then probed with `curl` and stopped again.

| Request | Status | Body / header | requestId |
|---|---|---|---|
| `GET /api/health` | 200 | `capabilities.ai.configured=false`, `export:"browser-native"`, `serverJobs:false`, `serverMediaProcessing:false`, `contractVersion:"2026-09-09-aistudio"` | `req_2d5202393a928e93` |
| `POST /api/ai/script` (no token) | **401** | `UNAUTHENTICATED`, `retryable:false` | `req_a63e069f3c410b32` |
| `POST /api/generateContent` | **410** | `NOT_IMPLEMENTED` + `SHIM-004: use /api/ai/script or /api/ai/speech` | `req_408e49f70cbcfb10` |
| `POST /api/export/start` | **410** | `NOT_IMPLEMENTED` + `SHIM-004: use browser-native export (ADR-004)` | `req_a5ed139387076f7d` |
| `POST /api/ai/script` with token + `{model, config}` | **400** | `VALIDATION_FAILED`, detail: `model is not an accepted field; config is not an accepted field` | `req_de2b43bbbe5bbee1` |
| `POST /api/ai/script` valid body, no key configured | **503** | `AI_NOT_CONFIGURED`, `retryable:false` — **never simulated content** | `req_7613a24723778b39` |
| `POST /api/ai/script` ×40 | **429** at #28 | `RATE_LIMITED`, `retryable:true`, header `Retry-After: 46` | `req_863a736a6a8a72f5` |

The server log for every one of these carries `requestId`, `tokenId` (session sid) and
`model` — never the API key and never the raw bearer token. A real Gemini call was **not**
made: there is no egress in this sandbox (R-030; that evidence belongs to WP-10).

## 1c. "Fails before, passes after" (WP-01 §10.2)

The pre-change state is commit `b67e40864ff652c0be1c54a164456eb57863e49e` (`git show <sha>:server.ts`).
The old server cannot be booted here (it needs `better-sqlite3`, removed from `package.json`),
so the "before" column is the code that made the assertion fail, quoted from that commit:

| Test | Before (`b67e408`) | After |
|---|---|---|
| **T-01** crafted `{model, config}` ⇒ 400 | `server.ts:203` `app.post('/api/generateContent', requireApiRateLimit, express.json(...))` — **no auth middleware** — and `:232` `ai.models.generateContent(req.body)` forwards the body verbatim, so a crafted body produced an outbound call, not a 400 | `400 VALIDATION_FAILED` — "model is not an accepted field; config is not an accepted field" (live `req_de2b43bbbe5bbee1`) |
| **T-02** no token ⇒ 401 in dev **and** production | `server.ts:88` `requireExportAuth` → `:89` `if (!EXPORT_TOKEN && process.env.NODE_ENV === 'production')`; in development the guard was a no-op, and `/api/generateContent` had no guard at all. `grep -c "api/ai/script"` on that commit ⇒ **0** (the route under test did not exist) | `401 UNAUTHENTICATED` in both environments (injected `ServerEnv`); live `req_a63e069f3c410b32` |
| **INV-010** failure ≠ success | `server.ts:218` and `:238` `const simulated = generateSimulatedContent(req.body)` returned `200`; `:1093` `Buffer.alloc(44 + pcmBytesLength)` = 1.00 s of silence | `503 AI_NOT_CONFIGURED` on all four AI routes (live `req_7613a24723778b39`); no simulation path exists in the tree |

## 2. WP-04 acceptance criteria (per `docs/execution/agents/WP-04.md` §10)

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | `repro-export-queue.mts` exits 0, unmodified | **PASS** | V-5 |
| 2 | `repro-queue-deadlock.mts` still exits 0 | **PASS** | V-6 |
| 3 | Tests #6, #9, #16, #18, #22 pass | **PASS** | `tests/unit/workflow/lifecycle.test.mts` T-04 (#6), T-02 (#9), T-06 (#16), T-03 (#18), T-12 (#22) |
| 4 | no `setInterval` in `src/features/video-studio/export/` | **PASS** | V-8 |
| 5 | export status written by exactly one component | **PASS** | `tests/unit/workflow/export-queue.test.mts` E-15 (the store exposes no `cancelJob`/`startExport`/`runExport`/`processQueue`) + E-01/E-04 (only the scheduler's mirror writes run-derived status) |
| 6 | UI progress driven by the runtime, not a component timer | **PASS** | E-16 (store progress is monotonic and reaches 100 only on `completed`); `VideoStudioPro.tsx` now forwards every progress event to `onProgress` |

## 3. Defects found *by* the new tests and fixed

Each was found by a test that failed first; the test that proves the fix is named.

| # | Defect | Fix | Proven by |
|---|---|---|---|
| F-1 | `delay(ms, signal)` rejected with `new Error('aborted')` because `createAppError` returns a plain object, so **every typed abort** (`TIMEOUT`, `EXPIRED`, `CANCELLED`) was downgraded to `INTERNAL` — step timeouts became un-retryable and mislabelled | `abortReason()` preserves a typed reason | lifecycle T-13, T-14 |
| F-2 | A step that threw an untyped `Error` while unwinding from an abort was typed `INTERNAL` instead of the abort reason | `WorkflowRuntime.stepError()` | lifecycle T-13 |
| F-3 | Run expiry relabelled the run `expired` but **never aborted the in-flight step**, which kept running against an already-disposed `RunScope` | expiry aborts the controller; `finalise` aborts on every non-success terminal transition | lifecycle T-12 |
| F-4 | `dispose()` cleared the grace timers, so a disposed runtime could leave runs permanently `running` | `dispose()` terminalises in-flight runs synchronously | lifecycle T-25 |
| F-5 | A retry started during backoff after the run expired attempted an **illegal transition** and ran another attempt on a terminal run | the rejected `retrying → running` transition stops the loop | lifecycle T-15 |
| F-6 | `WorkflowRuntime.retry()` dropped `deps`, so **every retry failed** with `DEPENDENCY_UNAVAILABLE` (a retried export could never find its renderer) | retry carries `previous.deps` | export-queue E-13 |
| F-7 | `ExportQueueScheduler.awaitRun` overwrote its waiter, orphaning the first caller's promise; and a job removed mid-run left the caller hanging forever | waiter list + settle on terminal even when the job is gone | export-queue E-02, E-14 |
| F-8 | A renderer failure reached the user as `"This step failed."`, hiding the real reason | `renderFailure()` types it `RENDER_FAILED`, sanitises paths/URLs/credentials into the safe `message`, keeps the raw text in `detail` | export-queue E-06 |
| F-9 | `VideoStudioPro.tsx`'s renderer ignored `onProgress`, so the queue UI could never show export progress, and a cancelled render left its promise unsettled until the 10 s grace timer | progress forwarded to the run; `finally` settles any stranded resolver | WP-04 criteria 5–6; E-04 |

## 4. Migrated test suites (deprecation note)

Three `npm test` suites asserted **removed** behaviour. They were rewritten in place
(file paths and runner registration unchanged) rather than deleted, and each carries
a header explaining exactly what was removed and why:

| Suite | Previously asserted | Now asserts | Assertions |
|---|---|---|---|
| `tests/phaseE-api-route-integrity.cjs` | `/api/generateContent`, the `/api/export/*` FFmpeg router, legacy caption routes, `degraded: true` fallbacks | the allowlisted `/api` surface, 410 on all 10 removed routes, strict schemas, mandatory `projectFps`, no simulated content, clients going through the gateway | 60 |
| `resolution-test/security-stage12.cjs` | `spawn('ffmpeg')`, `EXPORT_API_TOKEN`, upload sessions, data-URL decoding, output caps | no subprocess/FS/tmp surface at all, unconditional scope-bearing auth, per-IP **and** per-token rate limits, model ids in one module, no secret in the client bundle or logs | 35 |
| `tests/phase118-repaired-defect-regressions.cjs` | blob-URL revocation inside `RenderPipeline.ts`; `requireApiRateLimit`; `MAX_BINARY_EXPORT_REQUEST_BYTES`; the `'/api/generateContent': 30` rate-limit key | single-owner object-URL lifecycle (workflow delivers, store revokes); `rateLimit()` with both buckets; no binary parser; `/api/generateContent` → 410 | 4 relocated, 12 unchanged |

Behavioural coverage for the same invariants lives in `tests/server/contract.test.mts`
(15 HTTP-level tests), `tests/unit/workflow/*.test.mts` (47 tests) and
`tests/unit/ai/validateSpeech.test.mts` + `tests/unit/workflow/captions.test.mts` (26 tests).

| Suite | Tests | Covers |
|---|---|---|
| `tests/server/contract.test.mts` | 15 | WP-01 §8 T-01…T-10 over real HTTP with an injected transport |
| `tests/unit/workflow/lifecycle.test.mts` | 29 | WP-04 §10 criteria 3 (tests #6/#9/#16/#18/#22) + retry/timeout/checkpoint/concurrency |
| `tests/unit/workflow/export-queue.test.mts` | 18 | D-010 cases 1–3, single-writer status, runtime-driven progress |
| `tests/unit/workflow/captions.test.mts` | 11 | WP-09 §8 "caption timecodes correct at 24/30/60 fps" (D-022) |
| `tests/unit/ai/validateSpeech.test.mts` | 15 | WP-09 §8 #13 (WAV header from the decoded buffer) + all four TTS-validation rows |

## 4b. Deviations from the WP specs (deliberate, recorded)

| # | Spec text | What was done | Why |
|---|---|---|---|
| DV-1 | WP-09 §2.8 / ADR-009 §4: degraded mode behind `AI_ALLOW_SIMULATION=true` + `source:'simulated'` + a UI banner | **No simulation flag exists at all.** A missing key is `503 AI_NOT_CONFIGURED` on every AI route | ADR-009 *permits* the gated mode; it does not require it. Omitting it satisfies INV-010 unconditionally and leaves no code path that can fabricate content. The gate itself would be a standing hazard and a test surface |
| DV-2 | WP-09 §2.7: delete `DEFAULT_CAPTION_FPS`, keep a `SHIM-005` deprecated alias until WP-12 | The constant is **deleted outright**, no alias | A compile-time break is strictly safer than a runtime alias: `npx tsc --noEmit` now fails if any call site omits `fps`. WP-12's "remove SHIM-005" task becomes a no-op. Asserted by `tests/unit/workflow/captions.test.mts` (no `DEFAULT_CAPTION_FPS` or literal `fps = 30` in `src/`) |
| DV-3 | WP-04 acceptance: `repro-export-queue.mts` exits 0 unmodified, and "no fabricated success" | A **zero-length** render output is delivered with a visible warning instead of failing the job | See D-A below. The audit fixture uses `new Blob([])` as its success case, and AS-INV-14 governs *delivery* honesty, not content policy |

## 4c. Known limitation recorded, not hidden

`secondsToFrameTimecode` quantises with `Math.round(fps)` as its frame base while
`parseCaptionTimestamp` divides by the exact `projectFps`, so **fractional** broadcast rates
(23.976 / 29.97 / 59.94) do not round-trip exactly — measured drift ≈0.083 s at 90 s for
23.976 fps. Integer rates (24/25/30/50/60/120) round-trip within one frame, which is what
`docs/workflows/caption.md` mandates ("generate at 24/30/60 fps, assert the `FF` field differs
correctly"). The server conversion (`server/captions/srt.ts`) uses the same convention, so the
two sides agree with each other. Changing timecode semantics for drop-frame rates is a caption
behaviour change, not hardening, so it is recorded here for the caption owner (fps signatures
are coordinated with WP-07) and pinned by a test so the change cannot happen silently.

## 5. Recorded decisions

- **D-A — zero-length render output is delivered, not failed.** The `deliver` step
  fails only when the renderer hands back nothing usable (no object / non-`Blob` /
  nonsense size). A zero-length `Blob` is the renderer's own output and is delivered
  with a visible `Warning: the renderer returned an empty file.` phase, because the
  documented invariant is **delivery** honesty (AS-INV-14), not content policy, and
  `audit/repro-export-queue.mts` — which must pass unmodified — uses `new Blob([])`
  as its success fixture. Overridable: tightening this to a hard `RENDER_FAILED`
  requires changing the audit fixture, which `file-ownership-matrix.md` forbids here.
- **D-B — `VITE_MOCK_TTS` is documentation debt.** It is referenced only in
  `docs/workflows/tts.md:33` and `docs/security/security-model.md:130`; no code reads
  it. There is no simulation flag anywhere: a missing key is `503 AI_NOT_CONFIGURED`
  (ADR-009, INV-010). Those two doc lines should be corrected by their owners.
