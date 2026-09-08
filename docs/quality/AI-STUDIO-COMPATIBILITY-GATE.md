# AI Studio Compatibility Gate

**Gate ID:** G-31 — composed of **G-31-P** (Preview) and **G-31-U** (Published App)
**Class:** first-class architectural gate — **mandatory** for any runtime certification claim
**Owner:** WP-13 (execution) with WP-00 (harness) and WP-06 (suite)
**Precision-corrected:** 2026-09-09 (pre-execution review)
**Status:** **UNVERIFIED** — no item has been executed inside Google AI Studio.

---

## The question this gate answers

> **Can Neural-Pro operate correctly inside Google AI Studio without requiring Cloud Run or
> another external runtime?**

"External runtime" means an **unauthorised external media-processing, rendering, transcoding or
export service**. It does **not** mean the Gemini API — Gemini is a legitimate, approved
external AI service used through the server operation allowlist (see AS-14).

The gate fails if the answer is "yes, provided we also deploy X".

---

## 1. Certification contexts (never merged)

| Context | Name | Definition |
|---|---|---|
| **P** | **AI Studio Preview / Build-mode runtime** | the app running in the AI Studio preview frame (dev container) |
| **U** | **Published AI Studio application runtime** | the app running at its published URL |

```
G-31-P = Preview Compatibility Gate
G-31-U = Published App Compatibility Gate
G-31   = PASS  iff  G-31-P = PASS  AND  G-31-U = PASS
```

Results are recorded **separately and independently** for every criterion in each context. They
are never averaged, merged or summarised into one undifferentiated verdict.

## 2. Criterion record (required for every criterion, in every context)

| Field | Values |
|---|---|
| `status` | `PASS` · `FAIL` · `BLOCKED` · `UNKNOWN` · `NOT-APPLICABLE` |
| `evidenceClass` | `EXECUTED-RUNTIME` · `EXECUTED-BROWSER` · `STATIC-EVIDENCE` · `DOCUMENTED-PLATFORM` · `INFERRED` · `BLOCKED` · `UNKNOWN` |
| `evidenceRef` | artefact path / request id / screenshot / report file |
| `timestamp` | ISO-8601 of the observation |
| `context` | `P` · `U` |
| `reproducibility` | runs executed, and whether results agreed |

## 3. Evidence classification system

| Class | Meaning |
|---|---|
| **EXECUTED-RUNTIME** | directly observed inside the real AI Studio runtime |
| **EXECUTED-BROWSER** | directly observed in the browser, but not sufficient to establish server/runtime behaviour |
| **STATIC-EVIDENCE** | derived from repository/source inspection |
| **DOCUMENTED-PLATFORM** | supported by current official Google documentation |
| **INFERRED** | reasoned conclusion that is not executable evidence |
| **BLOCKED** | could not be tested because required runtime access/capability was unavailable |
| **UNKNOWN** | evidence is insufficient |

> **A compatibility PASS MUST NOT be based solely on `INFERRED`, `STATIC-EVIDENCE` or
> `DOCUMENTED-PLATFORM` where the gate requires actual runtime execution.**

## 4. Anti-false-PASS rule (normative)

> **No compatibility criterion may be promoted to PASS merely because the repository
> architecture appears compatible, Google documentation describes the capability, or a local
> environment successfully executes it.**
>
> For runtime-dependent criteria, PASS requires **executable evidence in the target context**.

Corollaries:
* a local Chromium success is **not** evidence for Context P or Context U;
* a `grep` finding is `STATIC-EVIDENCE` and cannot satisfy a runtime criterion alone;
* a documented platform capability is a **hypothesis** until executed.

---

## 5. Blocking criteria

| # | Criterion | Method | PASS condition | Contexts |
|---|---|---|---|---|
| **AS-01** | Application boots | Open the app; capture console | Tree renders; zero uncaught errors | P, U |
| **AS-02** | Client/server boundary works | `GET /api/health`, `GET /api/health/ai` | 200 with the capability block; `configured:true` when a key exists | P, U |
| **AS-03** | Gemini works through the server-side secret | One real `generatePodcastScript` + one `generateSpeech`; capture `requestId` | 200, schema-valid, **non-simulated** (`source !== 'simulated'`) | P, U |
| **AS-04** | No client secret exposure | Fetch every JS asset; assert `vite.config.ts` `define` has no secret | No key material in any asset or response | P, U |
| **AS-05** | Media import works | Import the deterministic fixture (MP4/MP3/PNG) | Asset appears with a **measured** duration; no placeholder | P, U |
| **AS-06** | Media preview works | Play and scrub; assert the frame at time T | Playback and scrub correct | P, U |
| **AS-07** | Timeline works | Add/trim/move; undo/redo | State consistent; `totalDuration` recomputes; undo restores exactly | P, U |
| **AS-08** | Project persistence works | Save → reload → resolve | Every asset resolves; zero `MediaMissingWarning` | P, U |
| **AS-09** | Export works end-to-end | Export the deterministic fixture; verify artefact integrity | Artefact decodes to the expected frame count and duration; hash recorded | P, U |
| **AS-10** | Export does not depend on Preview DOM | Export with the Preview panel closed/re-docked | Completes with all clips rendered; zero placeholder frames | P, U |
| **AS-11** | Cancellation works | Cancel at each of the 8 steps | Terminal state within `graceMs`; resources released | P, U |
| **AS-12** | Failures are real failures | Induce: no key, 429, timeout, malformed response, safety block | Distinct typed non-success codes; no fabricated content; no fake "API Connected" | P, U |
| **AS-13** | **Native-execution capability investigation** | Investigate whether the runtime permits native binaries, subprocess execution, FFmpeg, packaged binaries, executable permissions, and server-side media processing. **Classify A/B/C/D with recorded evidence.** | The capability is **classified** with evidence; if the architecture uses an unsupported capability, a **defect is filed with an owning WP**. **Not** a PASS merely because a grep found no `spawn` | P, U |
| **AS-14** | **No unauthorised external media-processing dependency** | Inventory every network destination contacted during a full export; classify each as AI-service / static-asset / media-processing / unknown | **No unapproved external media renderer, transcoder, export service or rendering backend.** Approved Gemini AI operations are **allowed and expected** | P, U |
| **AS-15** | **Deliverable reaches the user** (delivery contract) | Produce the artefact; verify artefact integrity; verify browser/user delivery behaviour; record exactly what is observable | `P-01.a` artefact produced **and** `P-01.b` delivered to the browser/user, with `EXECUTED-RUNTIME`/`EXECUTED-BROWSER` evidence; otherwise `EXPORT_DELIVERY_FAILED` is surfaced honestly. **Direct filesystem visibility (`P-01.d`) is informational only and never a PASS condition** | P, U |
| **AS-16** | **Honest failure when a capability is unavailable** | Deny a required capability by a **declared mechanism**, then assert the refusal | Honest refusal (export disabled with an explanation; no silent attempt). Evidence class `RUNTIME-DENIED` or `TEST-INJECTED`. If `NOT-EXECUTABLE`, record that fact — do not fabricate a runtime result | P, U |

## 6. Non-blocking criteria (recorded; may be accepted as limitations)

| # | Criterion | If it fails |
|---|---|---|
| AS-17 | Export duration within a bound for a 60 s 1080p project | recorded performance limitation with measured numbers |
| AS-18 | Export works when the tab is backgrounded | documented limitation (browser throttling) |
| AS-19 | Storage quota sufficient for a 500 MB project | documented limitation + eviction UX |
| AS-20 | Multi-tab concurrent editing | documented as unsupported in v1 |

## 7. Runtime unknowns resolved by this gate

| ID | Unknown | Resolved by |
|---|---|---|
| `P-01` | Export artifact delivery to the browser/user download surface (sub-observations `a`–`d`) | AS-09, AS-15 |
| `P-02` | Storage availability/partitioning in the frame | AS-08 |
| `P-03` | WebCodecs / `OfflineAudioContext`: availability, init, representative + sustained workload, completion, timing, resources, P-vs-U, throttling (10 sub-observations) | AS-09 |
| `P-04` | CSP / frame policy restrictions | AS-01, AS-09 |
| `P-05` | Proxy behaviour for long requests and cancellation | AS-03, AS-12, AS-11 |
| `P-06` | Preview vs Published differences across 13 measurable dimensions | every criterion, compared |

## 8. Execution procedure (WP-13)

1. Prepare the **deterministic fixture**; record its content hash.
2. **Context P**: open Build mode; run the probe; execute AS-01…AS-16; record per-criterion
   evidence with classification.
3. **Context U**: publish; execute AS-01…AS-16 again; record separately.
4. Compare the thirteen `P-06` dimensions; certify separately if a material difference exists.
5. Write `reports/ai-studio-compatibility-<date>.json` + the evidence bundle.
6. Derive `G-31-P`, `G-31-U`, `G-31` mechanically (§9).
7. File every FAIL as a defect with an owning WP (WP-13 does not repair).

## 9. G-31 derivation (normative)

```
G-31-P = PASS  iff every blocking criterion PASSES in Context P
G-31-U = PASS  iff every blocking criterion PASSES in Context U

G-31   = PASS    iff G-31-P = PASS AND G-31-U = PASS
G-31   = FAIL    if executable evidence demonstrates incompatibility
G-31   = BLOCKED if required runtime access/evidence is unavailable
G-31   = UNKNOWN if evidence is incomplete but execution was possible
```

| Situation | Result |
|---|---|
| Preview PASS, Published FAIL | **G-31 = FAIL** |
| Preview PASS, Published not executable | **G-31 = BLOCKED** |
| Either context unavailable | **G-31 = BLOCKED**, unless a narrower scope is declared in writing with an owner |

## 10. Rules

1. **No criterion may be marked PASS without the recorded artefact.**
2. A criterion that could not be executed is `BLOCKED`, never `PASS` and never omitted.
3. Tolerances are declared **before** the run and are not adjusted afterwards; a needed
   adjustment is a defect report.
4. Re-run the whole gate after any change to: the export path, the server boundary, the
   persistence layer, `metadata.json`, `vite.config.ts`, or the AI surface.
5. The gate is a **release gate**: no build may be called AI Studio compatible while `G-31` is
   not PASS.
6. **Preview and Published results remain separately auditable** forever — the report retains
   both, even after a combined verdict is recorded.
