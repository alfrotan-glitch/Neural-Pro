# Workflow Architecture

**Status:** no workflow engine exists today. This document defines the target.
Owns **INV-007** (every workflow reaches a terminal state).

---

## 1. Current state: React effects are the workflow engine

| Workflow | Where it lives | Lines | Observable? | Cancellable? | Resumable? |
|---|---|---|---|---|---|
| W1 Podcast generation | `App.tsx:generatePodcast` | ~120 | no | no | no |
| W2 TTS | `App.tsx:generateAudio` | ~90 | toast only | no | no |
| W3 Captions | `InspectorEngine.tsx` / `ResourceSidebar.tsx` | scattered | toast only | no | no |
| W4 Export | `VideoStudioPro.tsx` `useEffect([isExporting])` | ~270 | progress bar | partially | no |
| W5 Recovery | **does not exist** | — | — | — | — |

Consequences, all measured or reproduced:
* Export progress is driven by a `useEffect` whose only dependency is a boolean, so its
  closure captures whatever React state existed at that render (D-020: two fps sources).
* Cancellation of a queued job is a no-op; cancellation of a running job leaves the job
  `rendering` forever (D-010).
* No timeouts anywhere; a stalled Gemini call or a hung `spawn` blocks forever.
* No retry policy server-side; the only retry (TTS 429, 3 attempts) is inline in a loop.
* No idempotency — two clicks create two jobs and two full renders.
* Failure is disguised: `/api/generateContent` returns HTTP 200 with fabricated content
  (D-009), so no workflow ever *sees* the failure.

---

## 2. Target: WorkflowRuntime

Design constraints: runs in the browser (this is a client-heavy media app), must be
inspectable without React, must be testable headlessly, must not require a broker or a
service. **No external orchestrator** (ADR-003).

```ts
export interface WorkflowDefinition<I, O> {
  readonly id: WorkflowId;                 // 'export' | 'podcast' | 'tts' | 'captions' | 'recovery'
  readonly version: number;
  readonly inputSchema: Schema<I>;
  readonly outputSchema: Schema<O>;
  readonly steps: readonly WorkflowStepDef[];
  readonly retryPolicy: RetryPolicy;
  readonly timeoutPolicy: TimeoutPolicy;
  readonly recoveryPolicy: RecoveryPolicy;
}

export interface WorkflowStepDef {
  readonly id: string;                     // stable across versions — checkpoints key on it
  readonly name: string;
  readonly run: StepHandler;
  readonly retry?: RetryPolicy;            // override
  readonly timeoutMs?: number;             // override
  readonly checkpoint?: boolean;           // persist StepOutput on success
  readonly compensating?: StepHandler;     // run on failure of a later step
  readonly idempotent?: boolean;
}

export type StepHandler = (ctx: StepContext) => Promise<StepOutput>;

export interface StepContext {
  readonly runId: WorkflowRunId;
  readonly stepId: string;
  readonly attempt: number;
  readonly signal: AbortSignal;
  readonly input: StepInput;
  readonly log: StructuredLogger;          // bound to runId/stepId
  readonly checkpoint: CheckpointStore;    // read/write step outputs
  report(progress: number, message?: string): void;
}

export interface StepOutput { readonly [k: string]: unknown }
export interface StepError {
  readonly code: ErrorCode;                // contracts/errors.md
  readonly message: string;
  readonly retryable: boolean;
  readonly cause?: unknown;
}
```

### Run state machine (every workflow, every step)

```
                    ┌────────► cancelled ◄─────────┐
                    │                              │
idle ─► queued ─► validating ─► running ─► succeeded
                       │          │  │
                       │          │  └──► retrying ─► running | failed
                       ▼          ▼
                     failed    timed_out ─► failed | retrying
```

Terminal states: `succeeded`, `failed`, `cancelled`, `expired`.
**INV-007:** from any non-terminal state, `cancel()` or a timeout must reach a terminal state
within `TimeoutPolicy.graceMs`. Enforced by test invariant #7.

Legal transitions are table-driven; illegal transitions are rejected and logged, never
silently applied. React may *render* `WorkflowRun.status`; it may never assign it.

### Policies

```ts
export interface RetryPolicy {
  readonly maxAttempts: number;            // bounded — default 3
  readonly backoff: 'none' | 'fixed' | 'exponential';
  readonly baseDelayMs: number;            // default 500
  readonly maxDelayMs: number;             // default 8_000
  readonly jitter: boolean;                // default true
  readonly retryOn: readonly ErrorCode[];  // only these are retried
}

export interface TimeoutPolicy {
  readonly stepTimeoutMs?: number;
  readonly runTimeoutMs: number;
  readonly graceMs: number;                // time to reach a terminal state after cancel
}

export interface RecoveryPolicy {
  readonly strategy: 'restart' | 'resume-from-checkpoint' | 'manual';
  readonly retainCheckpointsMs: number;
  readonly maxResumeAgeMs: number;
}
```

### Checkpoints and idempotency

```ts
export interface Checkpoint {
  readonly runId: WorkflowRunId;
  readonly workflowId: WorkflowId;
  readonly stepId: string;
  readonly output: StepOutput;
  readonly createdAt: number;
}

export type IdempotencyKey = string;   // hash(workflowId + canonicalInput)
```

`WorkflowRuntime.start()` refuses a second run with the same `IdempotencyKey` while one is
non-terminal. Recovery reads the newest checkpoint for each completed step and resumes at the
first incomplete one, **after re-validating that checkpointed outputs are still valid**
(asset still exists, snapshot unchanged).

---

## 3. Workflow definitions

### W1 — Podcast Generation
```
Input { topic, channelName, duration, style, level, speakerCount, audience, pace, realism, hostA/B }
 → validate      (server-side schema; reject empty/oversized)
 → generateScript        [checkpoint, retry on AI_TRANSIENT, timeout 120s]
 → validateScript        (schema + non-empty + line bounds) → failure ⇒ failed, never fabricated
 → prepareTts
 → synthesize            [chunked, per-chunk retry, checkpoint after each chunk]
 → validateAudio         (non-silent, expected duration bounds)
 → persistAsset          (AssetRegistry → AssetId + real duration)
 → updateProject         (create clip with the REAL duration — fixes D-024)
 → completed
```

### W2 — TTS
```
Input { scriptLines[], voiceConfig, sampleRate }
 → chunk (10 lines)
 → generate (per chunk)
 → validate (mimeType + non-empty + declared sampleRate/channels MUST match the header we write)
 → decode (base64 → PCM)
 → concatenate (with explicit cross-fade policy)
 → detectDuration (decode via OfflineAudioContext — authoritative)
 → persistAsset
 → cleanup (revoke previous object URL)
```
**D-009 / WAV header:** the client hard-codes 24 kHz/mono/16-bit into a hand-written 44-byte
header. Target: read `mimeType`/metadata from the response, decode the buffer, and derive the
WAV header from the decoded `AudioBuffer`. Mismatch ⇒ `AI_RESPONSE_INVALID`, never a
wrong-speed file.

### W3 — Captions
```
Input { source: 'generate'|'import-srt'|'refine', payload, projectFps }
 → validate
 → parseOrGenerate
 → validateTiming        (monotonic, non-overlapping, within media bounds)
 → convertFps            (explicit projectFps — fixes D-022)
 → normalize             (punctuation/casing policy)
 → persist
```

### W4 — Export
See [export-architecture.md](export-architecture.md) §2 and [../workflows/export.md](../workflows/export.md).

### W5 — Recovery
```
Input { runId | workflowId + idempotencyKey }
 → locateCheckpoints
 → validateState         (snapshot matches, assets present)
 → decide: resume | restart | manual
 → run
 → cleanupInvalidResources  (orphaned object URLs, stale checkpoints, temp files)
 → terminal state
```

---

## 4. React boundary

```ts
// UI subscribes; it does not execute.
const run = useWorkflowRun(runId);          // { status, phase, progress, error }
run.cancel();                                // intents only
```

Forbidden in components: `setTimeout`-based progress, ad-hoc `isLoading` booleans driving a
multi-step operation, `useEffect` bodies containing more than one await of a side-effecting
call. Enforced by review (see [../quality/code-review-policy.md](../quality/code-review-policy.md))
and, for the export path, by a lint rule banning `document.querySelector` outside
infrastructure.

## 5. Observability

Every run emits structured events (see [../operations/logging.md](../operations/logging.md)):

```
{ runId, workflowId, version, stepId, attempt, event, status, ts, durationMs, errorCode }
```

`event ∈ { started, step_started, step_retry, step_succeeded, step_failed, progress,
cancelled, timed_out, completed, recovered }`.
