# ADR-011 — A Single Export Dispatch Authority

**Status:** Accepted
**Date:** 2026-09-08

## Context

Three code paths dispatch export jobs:

1. `VideoStudioPro.beginExport()` → `void renderPipeline.renderJob(...)`;
2. `RenderPipeline.executionTail` — an internal serialisation promise chain;
3. `ExportQueueManager`'s `setInterval(1500)` orchestrator, whose `runOrchestrator` calls
   `pipeline.renderJob(job)` for **every** job in state `waiting`, in both sequential and
   parallel branches.

Additionally `processMode === 'parallel'` is offered in the UI even though the pipeline
serialises on `executionTail`, and `runOrchestrator` is `async` inside `setInterval` with no
re-entrancy lock.

**Investigation result (recorded, not assumed):** two deadlock hypotheses were tested
executably in `audit/repro-queue-deadlock.mts` and **both were disproved**:
* H1 — a duplicate dispatch inside `executionTail` is absorbed by the
  `job.status !== 'waiting'` guard in `executeJob`;
* H2 — a dispatch inside the `waiting → rendering` window invokes the renderer once and the
  job reaches `completed`;
* H3 — N parallel jobs with one execution slot all complete.

The script exits 0 and is retained as a guard. Therefore this is **not** a reproduced defect;
it is a **structural risk (R-014)**: a polling orchestrator duplicating a pipeline that
already serialises, with three writers of job status and no single owner of dispatch.

## Decision

1. `WorkflowRuntime` is the **only** authority that starts, cancels, retries and reclassifies
   export runs.
2. `RenderPipeline` becomes a thin adapter over the workflow runtime; its `executionTail`
   serialisation is removed (the runtime owns concurrency policy).
3. `ExportQueueManager`'s `setInterval` orchestrator is **deleted**; the queue is driven by
   state transitions, not polling.
4. Concurrency policy is explicit: `maxConcurrentExports` (default 1), declared in settings.
   If `processMode: 'parallel'` is offered, it must be honoured by the runtime or removed from
   the UI — not silently downgraded.
5. Job status is written by exactly one component and mirrored into the store one-way.
6. `audit/repro-queue-deadlock.mts` stays in the suite so no future agent re-litigates the
   deadlock question.

## Consequences

* One owner for dispatch, status and concurrency.
* The 1.5 s polling loop disappears, removing a wake-up source and a re-entrancy hazard.
* WP-04 must keep the reproduced D-010 tests passing while replacing the mechanism.

## Alternatives considered

* **Keep polling, add a re-entrancy lock** — rejected: it preserves three status writers and a
  timer where none is needed.
* **Keep `executionTail` as the scheduler and delete the UI orchestrator only** — rejected:
  the pipeline would then own both dispatch and execution with no observable run state, which
  is what makes cancellation untestable today.
