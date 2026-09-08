# AI Studio Runtime Invariants

**Normative.** These invariants bind the architecture to the target runtime. Each states its
verification. An invariant without an executed verification is `UNVERIFIED` and cannot support a
freeze or certification claim.

**Target runtime:** Google AI Studio Web App runtime.
**Non-target:** Cloud Run, except as an explicitly optional external deployment path.

Legend — **Status:** `PASS` (verified executably) · `FAIL` (verified executably, violated) ·
`BLOCKED` (cannot execute here) · `UNVERIFIED` (not yet run).

---

| ID | Invariant | Statement | Verification | Class | Owner WP | Status |
|---|---|---|---|---|---|---|
| **AS-INV-01** | **Runtime invariant** | Neural-Pro MUST operate in the Google AI Studio Web App runtime **without mandatory Cloud Run dependency**. No requirement, gate, invariant or work package may depend on a self-managed Cloud Run deployment existing. | Gate **G-31 / AS-14**: run the full flow with no external service; plus a static test that no requirement document names Cloud Run as mandatory | executable + static | WP-13 | **UNVERIFIED** |
| **AS-INV-02** | **Secret invariant** | No Gemini secret reaches client code. `GEMINI_API_KEY` exists only in the AI Studio server runtime; it is never in the client bundle, never in `vite.config.ts` `define`, never in a response, never in a log. | `G-31 / AS-04`: grep `AIza…` and `GEMINI_API_KEY=<value>` over `dist/**`; assert no secret in `define`; assert no secret in any response body | static + executable | WP-07 | **UNVERIFIED** (values clean today; the `define` mechanism still exists — D-021) |
| **AS-INV-03** | **AI invariant** | The client cannot select arbitrary model, system instruction, tool, safety setting, or generation configuration. The path is: **client intent → validated operation → server-owned configuration → Gemini**. | `G-31 / AS-03` + server contract tests: crafted body ⇒ 400; no model id outside `server/config/models.ts` | executable + static | WP-01 | **FAIL** today (`server.ts:232` forwards `req.body`) |
| **AS-INV-04** | **Export invariant** | Export cannot depend on Preview DOM state. No `document.querySelector`, no React ref from the preview, no requirement that any preview component be mounted. | `G-31 / AS-10` + headless export test; lint bans `document.querySelector` outside `src/infra/**` | executable + static | WP-02 | **FAIL** today (`ExportMediaRegistry` scrapes the DOM) |
| **AS-INV-05** | **Media invariant** | Every exportable media asset has an **independent runtime representation**: an `AssetId` resolvable to bytes without the UI. A missing asset produces `ASSET_MISSING` naming the clip — never a placeholder. | `G-31 / AS-05`, `AS-10`; `resolveMediaForClip` returns a request for every clip | executable | WP-02, WP-05 | **FAIL** today |
| **AS-INV-06** | **Persistence invariant** | Ephemeral browser object URLs are **never** treated as durable asset identity. No `blob:`/`data:` string may appear in a persisted document. | `G-31 / AS-08`; serialisation assertion | executable | WP-05 | **FAIL** today (D-006) |
| **AS-INV-07** | **Failure invariant** | External/API failure cannot become fake success. No 200-with-substitute, no 1-second-of-silence TTS, no hard-coded "API Connected", no silent placeholder. | `G-31 / AS-12`: five induced failure modes ⇒ distinct typed non-success codes | executable | WP-09 | **FAIL** today (D-009) |
| **AS-INV-08** | **Workflow invariant** | Every workflow (W1 podcast, W2 TTS, W3 captions, W4 export, W5 recovery) has **explicit states, transitions, cancellation, timeout, retry and failure semantics**, owned by the application-level runtime — never by a React `useEffect`. | Workflow lifecycle tests; cancel-at-every-step; timeout tests; static: no multi-await effects | executable + static | WP-04 | **FAIL** today (D-010) |
| **AS-INV-09** | **Runtime capability invariant** | Unsupported capabilities must be **detected**, not silently assumed. Export is disabled *with an explanation* when a required capability is missing; it is never attempted and allowed to fail obscurely. | Capability probe tests; forced-unavailable fixtures; `G-31 / AS-16` | executable | WP-07, WP-13 | **UNVERIFIED** (no probe exists today) |
| **AS-INV-10** | **Server scope invariant** | The AI Studio server runtime performs **no media processing, no filesystem persistence and no background jobs**. It is a controlled AI/text gateway with bounded, cancellable, timeout-limited operations. | Static: no `spawn`, no `/tmp`, no durable writes in `server/**`; runtime: an export completes with the server receiving zero export traffic | static + executable | WP-01 | **FAIL** today (`spawn('ffmpeg')`, `/tmp/session_*`) |

---

## Additional runtime-derived invariants

| ID | Invariant | Verification | Status |
|---|---|---|---|
| **AS-INV-11** | Server operations are **bounded**: every AI/caption request has a timeout, a bounded retry policy and a bounded payload | server contract tests | **UNVERIFIED** |
| **AS-INV-12** | The application behaves correctly in **both** runtime contexts (AI Studio preview frame and published app URL); a difference is a defect, not an environment quirk | G-31 executed in both contexts | **UNVERIFIED** |
| **AS-INV-13** | The **AI Studio app manifest** (`metadata.json`) is treated as a first-class, owned configuration file. `requestFramePermissions` is the single authority for device permission requests; adding a permission requires an ADR | static test: `metadata.json` parses and matches the schema; no device API is used that is not declared | **PASS** (as a static property today: `[]` and no device API is used) |
| **AS-INV-14** | Deliverable honesty: an export is `completed` **only** when the artifact was delivered (or an explicit save affordance succeeded). Otherwise the terminal state is `failed` with `EXPORT_DELIVERY_FAILED` | `G-31 / AS-15` | **UNVERIFIED** |
| **AS-INV-15** | No architecture document, work package or gate may reintroduce an external platform as a **prerequisite** without an owner-approved ADR | static doc test: no "Cloud Run required"-class statement outside the optional-deployment sections | **PASS** (after this correction pass) |

---

## Verification rules

1. An invariant moves to `PASS` only when its named verification **ran** and produced a passing
   result, recorded with the command and its output.
2. `BLOCKED` requires the missing capability to be named (e.g. "no access to Google AI Studio
   from this environment").
3. Static verification is acceptable only where execution is impossible (AS-INV-02, AS-INV-10's
   static half, AS-INV-13, AS-INV-15) and must be labelled as such wherever cited.
4. Editing this table is not verification.

## Current summary

| Status | Count |
|---|---|
| PASS | 2 (AS-INV-13, AS-INV-15 — static properties) |
| FAIL | 6 (AS-INV-03, 04, 05, 06, 07, 08, 10 → 7 counting AS-INV-10) |
| BLOCKED | 0 |
| UNVERIFIED | 5 (AS-INV-01, 02, 09, 11, 12, 14 → 6) |

**Architecturally:** the invariants are now *correctly stated* for the target runtime.
**Evidentially:** most are not yet verified, because verification requires execution inside
Google AI Studio. That is precisely why the freeze is expressed as it is in
[../execution/ARCHITECTURE-FREEZE.md](../execution/ARCHITECTURE-FREEZE.md).
