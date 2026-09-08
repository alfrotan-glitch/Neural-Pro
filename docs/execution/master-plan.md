# Master Execution Plan

**Scope:** the NEURAL-PRO remediation and hardening programme.
**Revised 2026-09-09** for the **Google AI Studio Web App runtime** target.
**Method:** PHASE 0 discovery → PHASE 1 blueprint → **runtime reconciliation & re-freeze
(current)** → PHASE 2 execution, work package by work package.

---

## 0. Target (authoritative)

> **Neural-Pro's primary runtime target is the Google AI Studio Web App environment.
> Cloud Run is not a mandatory runtime dependency.**

Consequences for planning:
* Every WP must state whether it touches the **AI Studio server runtime**, the **browser
  runtime**, or both.
* No WP may introduce a dependency that only works on an external platform.
* WP-13 resolves the twelve **RUNTIME-UNKNOWN** capability items **by execution inside AI
  Studio**. Until it runs, the compatibility gate G-31 is `UNVERIFIED`.

## 1. Ordering principles

1. **Verification before repair.** WP-00 establishes tooling; every later WP proves its claims.
2. **P0 security before features.** WP-01 removes the two P0 surfaces before anything is shared
   or published — sharing an AI Studio app bills the **owner's** key, so an unauthenticated
   passthrough is a cost incident waiting to happen.
3. **Structural repair before semantic repair.** WP-02 (export independence) before WP-03
   (parity).
4. **AI Studio verification as early as feasible.** WP-13 can start as soon as WP-00's probe
   exists; it does not need the repair WPs, and its findings may re-scope them.
5. **Infrastructure before decomposition.** WP-08 moves files only after the contracts and pools
   exist.
6. **Cleanup last.** WP-12 removes shims after everything that depends on them is stable.

## 2. Sequence

```
WP-00  Verification & tooling baseline                    (unblocks everything)
  │
  ├──► WP-13  AI Studio Runtime Verification  ◄── starts as soon as the probe exists
  │            (produces the capability evidence that de-risks 02/05/06/07/10)
  │
  ├──► WP-01  Server security boundary        [P0]
  │                                             ├──► WP-09  AI hardening       [P1]
  ├──► WP-05  Persistence & AssetRegistry     [P1]  │
  │             └──► WP-02  Export independence [P0] │
  │                          └──► WP-03  Render parity [P1]
  │                                        └──► WP-04  Workflow runtime [P1]
  ├──► WP-07  Server hardening & runtime contract [P1]
  ├──► WP-06  Behavioural test architecture   [P1]
  ├──► WP-11  Resource lifecycle & duration   [P1]
  ├──► WP-08  Module layering & decomposition [P2]   (after 02/03/04/05)
  └──► WP-10  Recovery & runtime certification [P1]  (after 06 + repairs)
                └──► WP-12  Hygiene, i18n, determinism, shim removal
```

Concurrent-safe pairs (disjoint ownership):
`WP-01 ∥ WP-05`, `WP-01 ∥ WP-08`, `WP-03 ∥ WP-05`, `WP-07 ∥ WP-09`, `WP-13 ∥ any`,
`WP-06 ∥ any`.

Hard serialisations (shared files):
`WP-05 → WP-02 → WP-03 → WP-04`, `WP-05 → WP-11`, `WP-01 → WP-09`,
`WP-07 before WP-13's server probe`, `WP-12 last`.

## 3. Phase gates

| Gate | Requirement | Status |
|---|---|---|
| **G-PHASE1** | Blueprint complete and reconciled with the owner | ✔ |
| **G-RECON** | **Runtime reconciliation + architecture freeze accepted** | **Current — pending owner approval** |
| **G-P0** | WP-00 + WP-01 + WP-02 merged; 3 P0 defects closed | pending |
| **G-P1** | All P1 defects closed; static + executable gates PASS | pending |
| **G-31** | AI Studio compatibility gate PASS in **both** contexts (preview + published) | **UNVERIFIED** |
| **G-RT** | G-31 PASS + browser/live-service stages executed | pending |
| **G-PROD** | Monitoring live, rollback rehearsed, soak clean | pending |

## 4. Per-WP target-runtime review (required by the reconciliation)

| WP | Depends on Cloud Run? | Assumes unrestricted Node? | Assumes FFmpeg? | Assumes FS persistence? | Assumes external auth? | Assumes a platform? | Needs AI Studio change? | Parallel-safe with |
|---|---|---|---|---|---|---|---|---|
| WP-00 | no | no | no | no | no | no | **yes** — add AI Studio probe harness, capability suite | all |
| WP-01 | no | yes (corrected) | removes it | removes it | no | no | **yes** — rationale now AI Studio secret model; bound server ops | 05, 08, 13 |
| WP-02 | no | no | no | no | no | no | **yes** — export independence is also the headless-verification mechanism | 01, 09, 13 |
| WP-03 | no | no | no | no | no | no | no | 05, 09 |
| WP-04 | no | no | no | no | no | no | **yes** — add browser-side delivery step + bounded server calls | 01, 05 |
| WP-05 | no | no | no | **no (browser storage)** | no | no | **yes** — Firestore recorded as an optional adapter; iframe storage verification | 01, 03, 13 |
| WP-06 | no | no | no | no | no | no | **yes** — add the AI Studio compatibility suite | any |
| WP-07 | **demoted to optional** | no | no | no | no | **corrected** | **yes** — PORT rationale, optional container path, `/api/runtime/capabilities` | 09 |
| WP-08 | no | no | no | no | no | no | no | 06 |
| WP-09 | no | no | no | no | no | no | **yes** — operation allowlist is now the AI Studio secret model | 07 |
| WP-10 | **optional stage only** | no | no | no | no | **corrected** | **yes** — certification re-based on AI Studio; external deploy = optional Stage G | – |
| WP-11 | no | no | no | no | no | no | no | 01 |
| WP-12 | no | no | no | no | no | no | **yes** — `metadata.json`, `README.md`, `.env.example` are **protected AI Studio files** | – |
| **WP-13** | no (it proves independence) | no | no | no | no | no | **yes — it is the AI Studio WP** | all |

## 5. Commit and merge discipline

See [merge-strategy.md](merge-strategy.md). One WP per commit series; `type(wp-XX): summary`; no
mixed ownership; CI green; review evidence recorded.

## 6. Stop conditions

1. A WP requires a contract change without an approved ADR.
2. Two WPs contend for the same file (resequence — never concurrent edit).
3. A previously passing verification starts failing and the cause is unidentified.
4. A reproduction is modified instead of the production code.
5. A PASS claim cannot be reproduced by the recorded command.
6. **A WP proposes an external platform dependency without an owner-approved ADR.**
7. **A capability classified RUNTIME-UNKNOWN is treated as supported.**
