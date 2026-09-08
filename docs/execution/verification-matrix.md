# Verification Matrix

Every acceptance claim maps to a command and a verification class.
**Required test invariants** are the numbered behavioural tests the programme must add; they are
the difference between "the code exists" and "the behaviour is proven".

---

## 1. Required test invariants

| # | Invariant test | Class | WP | Current |
|---|---|---|---|---|
| 1 | Export produces the expected frame count for a known project | executable | WP-02 | **FAIL** |
| 2 | Export frame matches preview transform for the same frame | executable | WP-03 | **FAIL** (662 px) |
| 3 | Export clips cover-scaled media identically to preview | executable | WP-03 | **FAIL** (991.7 px) |
| 4 | Export uses the same active-clip set as preview | executable | WP-03 | **FAIL** |
| 5 | Export succeeds with the preview component unmounted | executable | WP-02 | **FAIL** (structural) |
| 6 | Cancel before render completes leaves a terminal state | executable | WP-04 | **FAIL** |
| 7 | Export releases all resources on success/failure/cancel | executable | WP-11 | **UNVERIFIED** |
| 8 | Media registry resolves every clip in a project | executable | WP-02 | **FAIL** |
| 9 | Double submission of the same job creates one run | executable | WP-04 | **FAIL** |
| 10 | Project save/reload restores user-uploaded media | executable | WP-05 | **FAIL** |
| 11 | No `blob:` URL appears in a persisted document | executable | WP-05 | **FAIL** |
| 12 | Every AI failure mode yields a typed non-success | executable | WP-09 | **FAIL** |
| 13 | TTS WAV header matches the decoded buffer | executable | WP-09 | **FAIL** |
| 14 | Generated-audio clip duration equals the decoded duration | executable | WP-11 | **FAIL** (D-024) |
| 15 | Object-URL create/revoke balance is zero per operation | executable | WP-11 | **FAIL** |
| 16 | Cancel during every step releases resources | executable | WP-04 + WP-11 | **UNVERIFIED** |
| 17 | One fps authority feeds count, encoder, timestamps, timecodes | executable | WP-11 | **FAIL** |
| 18 | Cancelling a queued job prevents its execution | executable | WP-04 | **FAIL** |
| 19 | Server boots with `PORT` from the environment | deployment | WP-07 | **BLOCKED** |
| 20 | No unauthenticated privileged request succeeds in any env | executable | WP-01 | **FAIL** |
| 21 | A client-supplied model id is rejected | executable | WP-01 | **FAIL** |
| 22 | Workflow runs terminate after timeout | executable | WP-04 | **UNVERIFIED** |
| 23 | Recovery brings an abandoned run to a terminal state | executable | WP-10 | **UNVERIFIED** |
| 24 | Domain layer contains no React/DOM/timer references | static | WP-08 | **PASS for `src/domain/core/**`** (`purity` + `boundaries` suites, 2026-09-09) / **UNVERIFIED** for the rest of `src/domain/**`, which does not exist yet |
| 25 | No secret material in `dist/**` | static | WP-07 | **PASS** (value) |
| 26 | Pixel parity between preview and export within tolerance | browser | WP-06 | **BLOCKED** |
| 27 | Full export of a fixture project in a real browser | browser | WP-06/WP-10 | **BLOCKED** |
| 28 | Live AI operation succeeds end-to-end | live-service | WP-10 | **BLOCKED** (no egress) |
| 29 | The canonical core agrees with the authorities that execute today (clip/source/effective/timeline duration, time mapping, project duration, clamping, transform normalisation, origin, translation, media frame) | executable | Core Architecture | **PASS** |
| 30 | Every exported value of `src/domain/core/**` has a test; every core shim is registered, owned and unexpired | static | Core Architecture | **PASS** |

## 2. Command registry

| Purpose | Command | Class |
|---|---|---|
| Typecheck | `npm run typecheck` | static |
| Lint + boundaries | `npm run lint` | static |
| Unit/property suite | `npm test` | executable |
| Canonical core suite | `npx tsx tests/domain-core/run.ts` | executable + static |
| Export registry repro | `npx tsx audit/repro-export-registry.mts` | executable |
| Transform order repro | `npx tsx audit/repro-transform-order.mts` | executable |
| Cover-clip repro | `npx tsx audit/repro-media-cover-clip.mts` | executable |
| Export queue repro | `npx tsx audit/repro-export-queue.mts` | executable |
| ondequeue leak repro | `node audit/repro-ondequeue-leak.cjs` | executable |
| Deadlock guard | `npx tsx audit/repro-queue-deadlock.mts` | executable |
| Parity (semantic) | `npm run test:parity` | executable |
| Parity (pixel) | `npm run test:parity:browser` | browser |
| Resource balance | `npm run test:resources` | executable |
| Server contract tests | `npm run test:server` | executable |
| Build | `npm run build` | static (bundling only) |
| Container boot | `docker run -e PORT=8080 … && curl /api/health` | deployment |
| Live AI smoke | `npm run smoke:ai` | live-service |

Commands marked *to be created* are added by WP-00 (`test:parity`, `test:resources`,
`test:server`, `smoke:ai`) and WP-07 (container boot).

## 3. WP → evidence table

| WP | Must produce |
|---|---|
| WP-00 | CI green on a clean checkout; all six repro commands wired in; browser runtime installed |
| WP-01 | #20, #21 green; route-absence test; no `spawn` in `server/**` |
| WP-02 | #1, #5, #8 green; `repro-export-registry` exits 0 |
| WP-03 | #2, #3, #4 green; `repro-transform-order`, `repro-media-cover-clip` exit 0 |
| WP-04 | #6, #9, #16, #18, #22 green; `repro-export-queue` exits 0; deadlock guard still 0 |
| WP-05 | #10, #11 green; migration test; quota/missing-asset tests |
| WP-06 | #26, #27 runnable; suite composition test; ≥ 80 % coverage of `src/domain/**` |
| WP-07 | #19, #24(no), #25 green; CI + container boot; error boundary test |
| WP-08 | #24 green; layer-graph test; domain-purity test; full suite still green |
| WP-09 | #12, #13 green; injection regression test; timeout/retry tests |
| WP-10 | #23, #27, #28 green; recovery tests; certification report |
| WP-11 | #7, #14, #15, #17 green; `repro-ondequeue-leak` exits 0 |
| WP-12 | #11 still green; shim-expiry test; i18n script test; determinism test |

## 4. Rules for recording results

1. Record the **command**, the **exit code**, and the **report path** — not a paraphrase.
2. A command that was not run is recorded as `not run — <reason>`; it is never recorded as
   passed with zero cases.
3. A report with zero executed cases has `status: UNVERIFIED`, never `passed: 0, failed: 0`.
4. Every matrix row is re-run at the end of the owning WP and at G-P1 / G-RT.
