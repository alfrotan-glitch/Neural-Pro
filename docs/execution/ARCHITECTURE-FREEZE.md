# ARCHITECTURE FREEZE

**Freeze ID:** AF-2026-09-09-AISTUDIO
**Status:** **ARCHITECTURE FROZEN — AI STUDIO NATIVE**
**Date:** 2026-09-09
**Authority:** Project owner runtime clarification → Principal Architect reconciliation
**Supersedes:** the Cloud-Run-centric target of the 2026-09-08 blueprint (`1e17e8c`)
**Correction record:** [../decisions/AI-STUDIO-TARGET-RUNTIME-CORRECTION.md](../decisions/AI-STUDIO-TARGET-RUNTIME-CORRECTION.md)

---

## What this freeze is — and what it is not

**It is:** a freeze of the *architectural target and design*, after full reconciliation against
the actual intended runtime. Every document, work package, invariant and gate now targets the
Google AI Studio Web App runtime, and no design decision is pending on an unresolved runtime
question (each unresolved item has a pre-committed resolution branch — see §"Verification
obligations").

**It is NOT:** a claim that Neural-Pro has been **verified** to work inside Google AI Studio.
It has not. No executable verification inside AI Studio has been performed from this
environment. The compatibility gate **G-31** is `UNVERIFIED`, and `RUNTIME CERTIFIED` remains
impossible until it passes.

**It is NOT:** a claim of production readiness.

---

## Target Runtime

**Google AI Studio Web App** (Build mode).

Neural-Pro is opened, developed, run, tested and used inside Google AI Studio. The runtime
comprises a React client executed in the **end user's browser** and a **server-side Node.js
runtime** provided by AI Studio.

## Primary deployment assumption

**AI Studio-native.**

The application must be correct, usable and verifiable inside AI Studio with **no external
service**. Publishing, ZIP download and GitHub sync are conveniences, not requirements.

## Cloud Run

**Optional / non-required unless separately justified.**

Google's documentation states that AI Studio apps run in an AI Studio-managed container and
that publishing creates a Cloud Run service. That is the **substrate**, not the target.
Neural-Pro does not create, configure or depend on a Cloud Run deployment. Container-derived
facts may be used as evidence about limits, always labelled *substrate-derived, not
AI-Studio-documented*. Any future requirement for a self-managed Cloud Run deployment requires
an owner-approved ADR.

## Server runtime

**AI Studio-supported Node.js server runtime.**

* npm packages: yes · secrets: yes, server-side only · outbound network: yes.
* Bounded: every operation has a timeout, a bounded retry policy and a bounded payload.
* **Excluded by design:** media processing, filesystem persistence, background jobs,
  subprocesses, native binaries.
* Operations: `generatePodcastScript`, `generateSpeech`, `generateCaptions`, `refineCaptions`,
  `parseSrt`, `exportSrt`. Plus health and capability endpoints.

## Gemini

**Server-side secret + controlled operation gateway.**

```
client intent → validated operation → server-owned configuration → Gemini
```

`GEMINI_API_KEY` is injected by AI Studio into the server runtime and never reaches client code.
The client may not select model, system instruction, tools, safety settings or generation
configuration. Sharing an app bills the owner's key, so the allowlist is a cost control as well
as a security control.

## Export

**AI-Studio-compatible verified architecture** — *designed*; verification pending G-31.

* **Canonical path: browser-native (Strategy A)** — `AssetRegistry → ExportMediaPool →
  buildCanonicalRenderPlan → Canvas2D → WebCodecs → mp4-muxer → Blob → delivery`.
* Server-side export (Strategy B) is **rejected by capability**: no FFmpeg binary, subprocess
  support undocumented.
* Operating model is **Strategy C (hybrid)**: the server performs AI/text operations only.
* Strategy D (external dependency) is available **only by explicit ADR**.
* Capability detection is mandatory; a missing required capability **disables export with an
  explanation** — it is never attempted and allowed to fail obscurely.
* Delivery has ordered fallbacks (`<a download>` → File System Access → manual) and a typed
  `EXPORT_DELIVERY_FAILED`.

## Persistence

**Runtime-appropriate durable asset strategy.**

* Durable: **browser-side IndexedDB** keyed by stable `AssetId`; project documents versioned
  with `schemaVersion`. `localStorage` for UI preferences only.
* Ephemeral (never persisted): blob/object URLs, media elements, WebCodecs objects,
  `AudioBuffer`s, `ImageBitmap`s, transient export state.
* **No server-side durable storage exists in the AI Studio Web App runtime.** Network stores
  (Firebase/Supabase) are **optional adapters** behind `AssetRegistry`, requiring an ADR.
* If in-frame storage proves restricted (`P-02`), **project export/import bundles** become the
  primary durability mechanism and IndexedDB becomes an accelerator.

## Workflow engine

**Neural-Pro application-level workflow/state machine.**

W1 podcast, W2 TTS, W3 captions, W4 export, W5 recovery — implemented in the application, with
explicit states, transitions, cancellation, timeouts, bounded retries, checkpoints, idempotency
and recovery. No platform workflow runtime is available and no server-side job runner may be
introduced. React subscribes to runs; it does not own them.

---

## External dependencies

Every dependency classified, per the freeze requirement.

### Required (in the target runtime)

| Dependency | Class | Notes |
|---|---|---|
| Node.js server runtime (AI Studio) | A | provided by the platform |
| npm packages: `express`, `@google/genai`, `react`, `react-dom`, `zustand`, `mp4-muxer`, `html-to-image`, `lucide-react`, `motion`, `dotenv` | A | all pure-JS |
| Browser: Canvas2D, WebCodecs, Web Audio, IndexedDB, `structuredClone`, `createImageBitmap` | A* | end user's browser; probed |
| `GEMINI_API_KEY` (server secret) | A | AI Studio-injected |

### Optional

| Dependency | Class | Notes |
|---|---|---|
| Firebase / Firestore / Firebase Auth | B/E | auto-provisionable; **not in v1 scope**; optional `AssetRegistry` adapter by ADR |
| Network-accessible databases | B/E | allowed if not firewalled; not required |
| Published app URL (`*.ai.studio`) | E | publishing is optional |
| GitHub two-way sync | A | developer workflow |

### Unsupported

| Dependency | Class | Notes |
|---|---|---|
| FFmpeg binary / `ffmpeg-static` | D | not provided; subprocess support undocumented |
| `spawn` / child processes | C→D | undocumented; excluded by design |
| Native node modules (`better-sqlite3`) | C→D | native build RUNTIME-UNKNOWN; no justification; being removed |
| Server filesystem persistence | D | no durable storage; filesystem ephemeral |
| Server background jobs / long-running server work | D/C | CPU during request processing; no job-runner offering |
| Platform workflow orchestration (Opal or similar) | D | not applicable to this codebase |

### Runtime-unknown (verification obligation, not a dependency)

| Item | Class | Resolved by |
|---|---|---|
| `P-01` downloads permitted inside the preview frame | C | WP-13 / AS-15 |
| `P-02` storage partitioning in the frame | C | WP-13 / AS-08 |
| `P-03` WebCodecs / OfflineAudioContext in the frame | C | WP-13 / AS-09 |
| `P-04` CSP restrictions in the frame | C | WP-13 / AS-01, AS-09 |
| `P-05` proxy behaviour for long requests and aborts | C | WP-13 / AS-03, AS-12 |
| `P-06` dev-container vs published-app differences | C | WP-13 (both contexts) |
| Streaming (SSE/chunked) through the proxy | C | not used; remains unknown by choice |
| WebSockets / multiplayer | C | not used |
| Request-cancellation semantics end-to-end | C | client-enforced anyway |
| Native module compilation in the AI Studio build | C | avoided |
| AI Studio CPU/memory limits | C | not architected upon |
| AI Studio request timeout | C | server operations are bounded regardless |

\* "A for a browser capability" means supported by modern browsers; AI Studio does not mediate
it. The residual AI Studio risk is the frame (`P-01`…`P-06`).

---

## Verification obligations (do NOT block implementation)

These are **not** architecture blockers: every one has a pre-committed resolution branch in the
design above, so implementation may proceed while they are resolved.

| Obligation | Owner | Gate |
|---|---|---|
| Execute AS-01…AS-16 in the **preview frame**, recorded per criterion with evidence class | WP-13 | **G-31-P** |
| Execute AS-01…AS-16 on a **published URL**, recorded per criterion with evidence class | WP-13 | **G-31-U** |
| Resolve `P-01…P-06` with recorded evidence and explicit evidence classifications | WP-13 | — |
| Live Gemini smoke with a real key | WP-10 | Stage F |
| Browser export + pixel parity | WP-06/WP-10 | Stage E |

**WP-13's only hard dependency is WP-00.** WP-07 (`/api/runtime/capabilities`) is **optional
enrichment**: if it has landed, WP-13 consumes and correlates it; if not, server-side capability
evidence is marked unavailable and WP-13 continues.

## Verification precision rules (normative)

1. **`G-31-P` and `G-31-U` are independent.** `G-31 = PASS` only if both pass. Preview PASS +
   Published FAIL ⇒ `G-31 = FAIL`. Either context unavailable ⇒ `G-31 = BLOCKED`.
2. **Every observation carries one evidence class** — `EXECUTED-RUNTIME` · `EXECUTED-BROWSER` ·
   `STATIC-EVIDENCE` · `DOCUMENTED-PLATFORM` · `INFERRED` · `BLOCKED` · `UNKNOWN`.
3. **No runtime PASS from static, documentary or inferred evidence.** No criterion passes because
   the repository looks compatible, Google documents the capability, or a local run succeeded.
4. **`P-01` is a delivery contract, not a filesystem guarantee.** `P-01.a` artifact produced +
   `P-01.b` delivered to the browser/user are the PASS conditions; `P-01.d` direct filesystem
   visibility is informational only.
5. **AS-13 is an investigation, not a presumption** (native binaries, subprocess, FFmpeg,
   packaged binaries, exec permissions, server-side media processing → classify A/B/C/D).
6. **AS-14 prohibits unauthorised external *media-processing* dependencies.** Gemini and approved
   AI operations remain legitimate external services.
7. **AS-16 declares its denial mechanism** and records `RUNTIME-DENIED` / `TEST-INJECTED` /
   `NOT-EXECUTABLE`. Untestable capability denial is recorded, never fabricated.
8. **The fixture is deterministic** (no remote media, no prior Blob URLs, no random waveforms, no
   timestamps, no unstable AI output, no external hosting, no prior browser state).
9. **WP-13 observes and records; it does not repair.** Every FAIL preserves evidence, names an
   owning WP, an affected invariant and a severity, then stops.

## Conditions that reopen this freeze

1. `P-01` or `P-02` resolves in a way that no pre-committed branch covers.
2. A genuinely required capability is proven unavailable in the AI Studio Web App runtime.
3. The owner changes the target runtime (new ADR required).
4. A work package proposes an external platform dependency without an owner-approved ADR.
5. WP-13 finds that the preview and published contexts differ in a way that invalidates a
   shared design assumption.

## Frozen artefacts

| Artefact | Path |
|---|---|
| Correction register | [../decisions/AI-STUDIO-TARGET-RUNTIME-CORRECTION.md](../decisions/AI-STUDIO-TARGET-RUNTIME-CORRECTION.md) |
| ADR-015 primary runtime | [../decisions/ADR-015-ai-studio-web-app-primary-runtime.md](../decisions/ADR-015-ai-studio-web-app-primary-runtime.md) |
| ADR-016 browser-native export | [../decisions/ADR-016-browser-native-export.md](../decisions/ADR-016-browser-native-export.md) |
| Media runtime & capability table | [../architecture/AI-STUDIO-MEDIA-RUNTIME.md](../architecture/AI-STUDIO-MEDIA-RUNTIME.md) |
| Runtime topology | [../architecture/runtime-topology.md](../architecture/runtime-topology.md) |
| Runtime & deployment | [../architecture/deployment-architecture.md](../architecture/deployment-architecture.md) |
| System overview (target section) | [../architecture/system-overview.md](../architecture/system-overview.md) §9 |
| Runtime invariants | [../contracts/AI-STUDIO-RUNTIME-INVARIANTS.md](../contracts/AI-STUDIO-RUNTIME-INVARIANTS.md) |
| Compatibility gate | [../quality/AI-STUDIO-COMPATIBILITY-GATE.md](../quality/AI-STUDIO-COMPATIBILITY-GATE.md) |
| Master plan | [master-plan.md](master-plan.md) |
| Dependency graph | [dependency-graph.md](dependency-graph.md) |
| File ownership matrix | [file-ownership-matrix.md](file-ownership-matrix.md) §8–§10 |
| Runtime certification plan | [runtime-certification-plan.md](runtime-certification-plan.md) |

## Sign-off

| Role | Status |
|---|---|
| Principal Architect | Reconciled — frozen as AI Studio native |
| Project owner | **Pending explicit approval** (STOP condition: no implementation may begin before approval) |
| Runtime verification (G-31) | **UNVERIFIED** — WP-13 |
