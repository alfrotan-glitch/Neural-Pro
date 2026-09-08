# Contract: Workflows

**Normative.** Owns **INV-007** and the retry/timeout/idempotency rules.

---

## 1. Model

```ts
export type WorkflowId = 'podcast' | 'tts' | 'captions' | 'export' | 'recovery';
export type WorkflowRunId = string;   // 'run_<uuid>'

export type RunStatus =
  | 'idle' | 'queued' | 'validating' | 'running'
  | 'retrying' | 'succeeded' | 'failed' | 'cancelled' | 'expired';

export interface WorkflowRun {
  readonly id: WorkflowRunId;
  readonly workflowId: WorkflowId;
  readonly version: number;
  readonly idempotencyKey: string;
  readonly status: RunStatus;
  readonly currentStepId: string | null;
  readonly attempt: number;
  readonly progress: number;            // 0..100, monotonic non-decreasing within a run
  readonly phase: string | null;
  readonly startedAt: number;
  readonly endedAt: number | null;
  readonly error: AppError | null;
  readonly checkpoints: Readonly<Record<string, Checkpoint>>;
  readonly result: StepOutput | null;
}
```

## 2. Transition table (normative)

| From → To | allowed |
|---|---|
| `idle → queued` | ✔ |
| `queued → validating \| cancelled \| expired` | ✔ |
| `validating → running \| failed \| cancelled` | ✔ |
| `running → retrying \| succeeded \| failed \| cancelled \| expired` | ✔ |
| `retrying → running \| failed \| cancelled \| expired` | ✔ |
| `succeeded \| failed \| cancelled \| expired →` | ∅ terminal |

Anything else is **rejected and logged** (`workflow.illegal_transition`), never silently
applied. There is no path from a terminal state back to a non-terminal one; a retry creates a
**new run** with the same idempotency key and `attempt + 1`.

## 3. Cancellation

```
cancel(runId, reason?)
  1. record intent (so a queued run that has not started will not start)
  2. abort the run's AbortController
  3. every step must observe `signal` or poll it between await points
  4. within TimeoutPolicy.graceMs the run MUST be in `cancelled`
  5. cleanup runs (finally blocks) regardless of how the run ended
```

**INV-007a:** a cancelled run never continues executing.
**INV-007b:** a running run reaches a terminal state after cancellation.
Both are required test invariants (#6, #7), both currently fail (D-010).

## 4. Retry

```ts
export interface RetryPolicy {
  maxAttempts: number;            // default 3, HARD BOUNDED
  backoff: 'none' | 'fixed' | 'exponential';
  baseDelayMs: number;            // 500
  maxDelayMs: number;             // 8_000
  jitter: boolean;                // true
  retryOn: readonly ErrorCode[];  // allowlist
}
```

Retry is per-step, counted, logged (`workflow.step_retry` with `attempt`), and bounded. A step
that exhausts retries fails the run. No unbounded `while (…)` retry loops anywhere
(the current TTS loop in `App.tsx` is inline and must move into this model).

## 5. Timeout

```ts
export interface TimeoutPolicy { stepTimeoutMs?: number; runTimeoutMs: number; graceMs: number }
```

Defaults: `runTimeoutMs` 30 min (export), 10 min (podcast/TTS), 2 min (captions);
`graceMs` 10 s. Timeout produces `TIMEOUT`/`EXPIRED`, retryable only if the policy allows.

## 6. Checkpoints & recovery

```ts
export interface Checkpoint {
  runId: WorkflowRunId; workflowId: WorkflowId; stepId: string;
  output: StepOutput; createdAt: number;
}
```

A step marked `checkpoint: true` persists its output. Recovery (`recovery` workflow):

1. locate checkpoints for the `idempotencyKey`, newest first;
2. **validate** each (snapshot unchanged, assets still present, output shape valid);
3. resume at the first step without a valid checkpoint, else restart;
4. if validation fails irrecoverably → `failed` with `ASSET_MISSING` / `PERSISTENCE_CORRUPT`;
5. cleanup: release orphaned resources, drop expired checkpoints.

## 7. Idempotency

`idempotencyKey = stableHash(workflowId + version + canonicalInput)`.
`WorkflowRuntime.start()` with a key that has a non-terminal run returns that run instead of
creating a duplicate. This is what makes double-click safe (required invariant #9).

## 8. Resource ownership

A run owns every resource it creates. `finally` blocks (or an explicit `RunScope` collecting
disposers) release: media elements, object URLs, encoders, muxers, timers, listeners,
checkpoints past their retention window.

```ts
export interface RunScope {
  add(disposer: () => void | Promise<void>): void;
  disposeAll(): Promise<void>;       // called on EVERY terminal transition
}
```

## 9. React boundary

```ts
const run = useWorkflowRun(runId);  // subscribes; read-only view
run.cancel();                        // intent
```

React may render `run.status` / `run.progress` / `run.error.message`. React must not assign
status, must not hold the authoritative copy, and must not drive multi-step logic from
`useEffect`.

## 10. Observability

Emitted events (see [../operations/logging.md](../operations/logging.md)):
`workflow.started`, `workflow.step_started`, `workflow.step_retry`, `workflow.step_succeeded`,
`workflow.step_failed`, `workflow.progress`, `workflow.cancelled`, `workflow.timed_out`,
`workflow.completed`, `workflow.recovered`, `workflow.illegal_transition`.
Every event carries `{ runId, workflowId, version, stepId?, attempt?, ts, durationMs?, errorCode? }`.
