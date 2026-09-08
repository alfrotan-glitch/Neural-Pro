# AI Studio Compatibility Gate

**Gate ID:** G-31
**Class:** first-class architectural gate — **mandatory** for any runtime certification claim
**Owner:** WP-13 (execution) with WP-00 (harness) and WP-06 (suite)
**Status:** **UNVERIFIED** — no item has been executed inside Google AI Studio from this
environment.

---

## The question this gate answers

> **Can Neural-Pro operate correctly inside Google AI Studio without requiring Cloud Run or
> another external runtime?**

The gate fails if the answer is "yes, provided we also deploy X".

---

## 1. Verdict rule

| Result | Condition |
|---|---|
| **PASS** | Every **BLOCKING** criterion executed and PASS, in **both** the AI Studio preview frame **and** a published app URL. Every **NON-BLOCKING** criterion either PASS or recorded as a documented, owner-accepted limitation. No BLOCKING criterion may be `UNVERIFIED`. |
| **FAIL** | Any BLOCKING criterion executed and FAIL. |
| **BLOCKED** | Any BLOCKING criterion cannot be executed in the available environment. **BLOCKED is not PASS.** |
| **UNVERIFIED** | The gate has not been run. This is the current status. |

A certification claim may not be made above `ENGINEERING READY` while this gate is not PASS.

---

## 2. Blocking criteria

Each criterion names: what is measured, how, and what counts as PASS.
`Context` = **P** (AI Studio preview frame) and/or **U** (published `*.ai.studio` / Cloud Run URL).

| # | Criterion | Method | PASS | Context |
|---|---|---|---|---|
| **AS-01** | Application boots | Open the app; assert the root renders and no fatal console error | Tree renders; zero uncaught errors | P, U |
| **AS-02** | Client/server boundary works | `GET /api/health` from the running app; `GET /api/health/ai` | 200 with the capability block; `configured:true` when a key exists | P, U |
| **AS-03** | Gemini calls work through the server-side secret | Run one real `generatePodcastScript` and one `generateSpeech`; capture status + `requestId` | 200, schema-valid, non-simulated (`source !== 'simulated'`) | P, U |
| **AS-04** | No client secret exposure | Fetch every JS asset; grep for `AIza…`, `GEMINI_API_KEY=<value>`; assert `vite.config.ts` `define` has no secret | Zero matches | P, U |
| **AS-05** | Media import works | Import a local video + audio + image file; assert decode, measured duration, and AssetRegistry write | Asset appears with a measured duration; no placeholder | P, U |
| **AS-06** | Media preview works | Play the imported clip; scrub; assert the frame at time T is the frame at time T | Playback and scrub correct | P, U |
| **AS-07** | Timeline works | Add/trim/move a clip; undo; redo; assert `totalDuration` recomputes | State consistent; undo restores exactly | P, U |
| **AS-08** | Project persistence works | Save → reload → assert media resolves and the timeline is identical | Every asset resolves; zero `MediaMissingWarning` | P, U |
| **AS-09** | Export works end-to-end | Export a 3-clip fixture project; assert frame count, duration, decodability | MP4 decodes to the expected frame count and duration | P, U |
| **AS-10** | Export does not depend on Preview DOM | Export with the Preview panel closed/re-docked | Export completes with all clips rendered; zero placeholder frames | P, U |
| **AS-11** | Cancellation works | Start export; cancel at each of the 8 steps; assert a terminal state and released resources | Terminal state within `graceMs`; resource balance zero | P, U |
| **AS-12** | Failures are real failures | Induce: no key, upstream 429, upstream timeout, malformed response, safety block | Non-2xx with distinct typed codes; no fabricated content; no fake "API Connected" | P, U |
| **AS-13** | No unsupported native binary dependency | Static: no `spawn`, no `ffmpeg` string, no native dependency in `package.json`; runtime: no export path touches the server | Zero matches; export completes with the server idle | P, U |
| **AS-14** | No mandatory Cloud Run dependency | Remove/ignore any external deployment; run the full flow in AI Studio only | All of AS-01…AS-13 PASS with no external service | P, U |
| **AS-15** | Deliverable reaches the user | After export, assert the file lands on disk (or an explicit save affordance succeeded) | File present, or `EXPORT_DELIVERY_FAILED` surfaced honestly | P, U |
| **AS-16** | Capability detection works | Run on a browser/context missing a required capability | Export disabled with an explanation; no silent attempt | P |

---

## 3. Non-blocking criteria (recorded, may be accepted as limitations)

| # | Criterion | If it fails |
|---|---|---|
| AS-17 | Export duration within an acceptable bound for a 60 s 1080p project | Recorded as a performance limitation with measured numbers |
| AS-18 | Export works when the tab is backgrounded | Documented limitation (browser throttling) |
| AS-19 | Storage quota is sufficient for a 500 MB project | Documented limitation + eviction UX |
| AS-20 | Multi-tab concurrent editing | Documented as unsupported in v1 |

---

## 4. Runtime unknowns this gate resolves

| ID | Unknown | Resolved by |
|---|---|---|
| `P-01` | Downloads permitted inside the preview frame | AS-15 |
| `P-02` | Storage partitioning / availability in the frame | AS-08 |
| `P-03` | WebCodecs / OfflineAudioContext availability and throttling in the frame | AS-09 |
| `P-04` | CSP restrictions in the frame | AS-01, AS-09 |
| `P-05` | Proxy behaviour for long requests and aborts | AS-03, AS-12 |
| `P-06` | Preview-dev-container vs published-app differences | Every criterion run in **both** contexts |

---

## 5. Execution procedure (WP-13)

1. Open the project in **Google AI Studio → Build mode**. Confirm the app id
   (`README.md` → `https://ai.studio/apps/bdf5ad65-6c0d-48f4-8ba5-1e1a337f20ce`).
2. Run the runtime probe: `GET /api/runtime/capabilities`; capture the JSON.
3. Execute AS-01…AS-16 in the **preview** context. Record evidence per criterion
   (screenshot / console excerpt / request id / file hash).
4. **Publish** the app (Starter Tier is sufficient). Re-execute AS-01…AS-16 against the
   published URL.
5. Write `reports/ai-studio-compatibility-<date>.json` plus
   `reports/ai-studio-compatibility-evidence/` with the raw artefacts.
6. Update the gate table here with PASS/FAIL/BLOCKED per criterion **per context**.
7. Any FAIL becomes a defect with an owning WP. Any BLOCKED names the missing capability and
   the person who can unblock it.

## 6. Rules

1. **No criterion may be marked PASS without the recorded artefact.**
2. A criterion that could not be executed is `BLOCKED`, never `PASS` and never omitted.
3. Tolerances (durations, pixel deltas) are declared **before** the run and are not adjusted
   afterwards; a needed adjustment is a defect report.
4. Re-run the whole gate after any change to: the export path, the server boundary, the
   persistence layer, `metadata.json`, `vite.config.ts`, or the AI surface.
5. The gate is a **release gate**: a build may not be called AI Studio compatible while G-31 is
   not PASS.
