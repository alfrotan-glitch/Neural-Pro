# ADR-003 — In-Application Workflow Runtime (No External Orchestrator)

**Status:** Accepted
**Date:** 2026-09-08

## Context

Long-running operations (podcast generation, TTS, caption processing, export) have no engine.
They are `useEffect` bodies and `setInterval` loops. Observed consequences:

* export progress lives in a `useEffect([isExporting])` (~270 lines) whose closure captures
  whatever React state existed at that render — the source of the two-fps-authority defect
  (D-020);
* cancelling a queued job is a no-op and cancelling a running job leaves it `rendering`
  forever (D-010, reproduced);
* no timeouts, no bounded retries, no idempotency, no recovery;
* failures are invisible because the server returns 200 with fabricated content (D-009).

ADR-001 establishes that no platform workflow runtime is available.

## Decision

Implement a **WorkflowRuntime inside the application** (see
[../architecture/workflow-architecture.md](../architecture/workflow-architecture.md)):

* five workflow definitions (W1 podcast, W2 TTS, W3 captions, W4 export, W5 recovery);
* an explicit run state machine with a normative transition table;
* per-step retry (allowlisted, bounded, jittered), timeout and checkpointing;
* idempotency keys; a recovery workflow;
* React subscribes and renders; it never owns the state.

No external broker, queue, or orchestration service.

## Consequences

* Workflows become testable headlessly (the runtime has no React dependency).
* Cancellation, timeout and recovery become enforceable invariants (INV-007).
* `VideoStudioPro`'s 480-line export effect, `App.tsx`'s podcast/TTS code, and the
  `setInterval` orchestrator are removed (WP-04, WP-08).
* A small amount of infrastructure code is added (~600 LOC), which is justified by five
  workflows that currently have no observable state at all.

## Alternatives considered

* **GCP Workflows / Cloud Tasks** — rejected: the export workflow is browser-side (media never
  leaves the client); AI calls are single-step proxied requests; an external control plane
  would add cost, latency and a new failure domain without addressing the client-side
  cancellation problem.
* **A third-party library (Temporal, XState)** — rejected for now: the needed surface (bounded
  retry, checkpoint, cancel, idempotency) is small, and adding a dependency to satisfy it
  would enlarge the install surface that is already fragile (D-012). Revisit only if the
  runtime grows beyond ~1 000 LOC.
