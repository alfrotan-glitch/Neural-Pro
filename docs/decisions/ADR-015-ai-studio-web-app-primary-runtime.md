# ADR-015 — Google AI Studio Web App Runtime Is the Primary Target

**Status:** Accepted — **supersedes the Cloud-Run-targeting parts of ADR-001**
**Date:** 2026-09-09
**Trigger:** Project owner clarification of the intended target runtime.
**Full correction record:** [AI-STUDIO-TARGET-RUNTIME-CORRECTION.md](AI-STUDIO-TARGET-RUNTIME-CORRECTION.md)

---

## Context

ADR-001 (2026-09-08) resolved the "Google AI Studio" question by researching Build mode and
concluding, correctly, that Build mode produces a client **plus a Node.js server runtime**, that
secrets are server-side, and that publishing provisions Cloud Run. It then made Cloud Run the
**deployment target** and derived the runtime contract from Cloud Run's container contract.

That was the wrong dependency direction. Neural-Pro is opened, developed, run, tested and used
**inside Google AI Studio**. Cloud Run is one optional publish path among three
(AI Studio Publish, ZIP download, GitHub sync). Architecting against the publish path made an
optional target load-bearing and produced at least one wrong severity grading (D-015).

The owner has now clarified the target explicitly.

## Decision

1. **Primary target runtime: the Google AI Studio Web App runtime** (Build mode / Web App).
   Neural-Pro must be correct, usable and verifiable **inside AI Studio**.
2. **Cloud Run is an optional external deployment path, never a prerequisite.** It may be
   documented and supported for the publish flow, but no Neural-Pro requirement, gate or
   invariant may depend on a Cloud Run deployment existing.
3. **The server boundary is the AI Studio-supported Node.js server runtime** — npm packages,
   server-side secrets, outbound network. Its purpose is: controlled AI operations, caption
   processing, and small stateless helpers. It is **not** a media-processing back-end and
   **not** a job runner.
4. **Gemini access follows the AI Studio server-side secret model**: `GEMINI_API_KEY` is
   injected server-side; the browser never receives it; the client requests **validated
   operations**, never model or generation configuration.
5. **Export is browser-native** (Canvas / WebCodecs / Web Audio) — see ADR-016.
6. **Durable state is browser-side** (IndexedDB) or an explicitly approved network store.
   AI Studio has no built-in server-side persistent storage today.
7. **Every platform capability is classified A–E** (see the correction register §8). Class C
   items are **RUNTIME-UNKNOWN** and must be resolved by **executable verification inside AI
   Studio** (WP-13), never by assumption.
8. **Capability detection is mandatory**: the application must probe required capabilities and
   surface an actionable diagnosis when one is missing.

## Rationale: the substrate question

Google's FAQ states: *"AI Studio apps are standard apps running in a Cloud Run container."*
This ADR does not dispute that. It draws the architectural boundary differently:

* the container is **provided and managed by AI Studio**;
* Neural-Pro targets **AI Studio**, not the container;
* container-derived facts may be used as **evidence about limits** (ephemeral filesystem, CPU
  during request processing, request timeouts), but each such argument must be labelled
  *substrate-derived, not AI-Studio-documented*;
* no capability may be claimed for AI Studio merely because generic Cloud Run has it, and no
  Neural-Pro requirement may be expressed as a Cloud Run deployment.

## Consequences

* `deployment-architecture.md` and `runtime-topology.md` are rewritten around AI Studio.
* Release gates G-21…G-23 (container boot, production static serving, graceful shutdown) are
  **re-scoped as optional external-deployment gates**; a new **G-31 AI Studio compatibility
  gate** becomes mandatory for any runtime certification claim.
* D-015 (`const PORT = 3000`) drops from P1 to **P2**: it is the AI Studio convention and the
  app runs there with it today. The fix (`process.env.PORT ?? 3000`) is retained so external
  deployment also works.
* ADR-004 (remove the FFmpeg export path) is upheld, but its rationale changes from "Cloud Run
  has no ffmpeg" to "the AI Studio Web App runtime provides no FFmpeg binary and subprocess
  execution is undocumented" — see ADR-016.
* A new WP-13 executes the runtime verification inside AI Studio.
* `metadata.json` — the AI Studio app manifest — becomes a protected, owned file.

## Alternatives considered

| Alternative | Verdict |
|---|---|
| Keep Cloud Run as the target (status quo) | **Rejected by owner.** It makes an optional publish path load-bearing. |
| Treat AI Studio as client-only React (drop the server) | **Rejected.** Officially obsolete: Build mode web apps include a server-side Node.js runtime, and secrets are server-side only. Removing the server would force the Gemini key into the browser. |
| Server-side export in the AI Studio runtime | **Rejected** — no FFmpeg binary, subprocess support undocumented. See ADR-016. |
| Make Firebase/Firestore the primary store | **Rejected for v1.** It is *available* (auto-provisioned) but introduces an external service dependency, per-user auth, and cost. Recorded as an **optional adapter** behind `AssetRegistry`. |
| Assume container capabilities because "it's a container" | **Rejected.** ADR-000: uncertainty is recorded, not converted into an assumption. |
