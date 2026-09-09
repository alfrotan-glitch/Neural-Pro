/**
 * Workflow runtime types — implements `docs/contracts/workflows.md` and
 * `docs/architecture/workflow-architecture.md` §2.
 *
 * Pure domain types: no React, no DOM, no I/O.
 */
import type { AppError, ErrorCode } from '../../domain/errors/appError';

export type WorkflowId = 'podcast' | 'tts' | 'captions' | 'export' | 'recovery';
export type WorkflowRunId = string;

export type RunStatus =
  | 'idle'
  | 'queued'
  | 'validating'
  | 'running'
  | 'retrying'
  | 'succeeded'
  | 'failed'
  | 'cancelled'
  | 'expired';

export type StepOutput = Readonly<Record<string, unknown>>;

export interface Checkpoint {
  readonly runId: WorkflowRunId;
  readonly workflowId: WorkflowId;
  readonly idempotencyKey: string;
  readonly stepId: string;
  readonly output: StepOutput;
  readonly createdAt: number;
}

export interface CheckpointStore {
  put(checkpoint: Checkpoint): void | Promise<void>;
  list(idempotencyKey: string): readonly Checkpoint[];
  latest(idempotencyKey: string, stepId: string): Checkpoint | undefined;
  /** Drops checkpoints older than the retention window. */
  prune(now: number, retainMs: number): void | Promise<void>;
}

export interface RetryPolicy {
  readonly maxAttempts: number;
  readonly backoff: 'none' | 'fixed' | 'exponential';
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly jitter: boolean;
  /** Allowlist: only these codes are retried (contracts/errors.md §4). */
  readonly retryOn: readonly ErrorCode[];
}

export interface TimeoutPolicy {
  readonly stepTimeoutMs?: number;
  readonly runTimeoutMs: number;
  readonly graceMs: number;
}

export interface RecoveryPolicy {
  readonly strategy: 'restart' | 'resume-from-checkpoint' | 'manual';
  readonly retainCheckpointsMs: number;
  readonly maxResumeAgeMs: number;
}

export interface RunScope {
  add(disposer: () => void | Promise<void>): void;
  disposeAll(): Promise<void>;
}

export interface WorkflowStepContext {
  readonly runId: WorkflowRunId;
  readonly workflowId: WorkflowId;
  readonly stepId: string;
  readonly attempt: number;
  readonly signal: AbortSignal;
  /** Merged output of every previous step plus the run input. */
  readonly input: Readonly<Record<string, unknown>>;
  /**
   * Injected collaborators (gateways, registries). Kept out of `input` so it
   * never pollutes the idempotency key.
   */
  readonly deps: Readonly<Record<string, unknown>>;
  readonly checkpoints: CheckpointStore;
  readonly scope: RunScope;
  report(progress: number, message?: string): void;
}

export type StepHandler = (ctx: WorkflowStepContext) => Promise<StepOutput>;

export interface WorkflowStepDef {
  readonly id: string;
  readonly name: string;
  readonly run: StepHandler;
  readonly retry?: RetryPolicy;
  readonly timeoutMs?: number;
  readonly checkpoint?: boolean;
  readonly compensating?: StepHandler;
  readonly idempotent?: boolean;
}

export interface WorkflowDefinition {
  readonly id: WorkflowId;
  readonly version: number;
  readonly steps: readonly WorkflowStepDef[];
  readonly retryPolicy: RetryPolicy;
  readonly timeoutPolicy: TimeoutPolicy;
  readonly recoveryPolicy: RecoveryPolicy;
  /** Returns null when valid, otherwise a typed error. Never throws. */
  readonly validateInput: (input: unknown) => AppError | null;
  /**
   * Optional checkpoint validator used by resume/recovery: returns false when a
   * stored output is no longer trustworthy (asset gone, snapshot changed), which
   * makes the runtime re-run that step instead of replaying stale data.
   */
  readonly validateCheckpoint?: (stepId: string, output: StepOutput) => boolean;
  /** Max concurrent runs of this workflow (export = 1). */
  readonly maxConcurrent?: number;
}

export interface WorkflowRun {
  readonly id: WorkflowRunId;
  readonly workflowId: WorkflowId;
  readonly version: number;
  readonly idempotencyKey: string;
  readonly status: RunStatus;
  readonly currentStepId: string | null;
  readonly attempt: number;
  /** 0..100, monotonic non-decreasing within a run. */
  readonly progress: number;
  readonly phase: string | null;
  readonly startedAt: number;
  readonly endedAt: number | null;
  readonly error: AppError | null;
  readonly checkpoints: Readonly<Record<string, Checkpoint>>;
  readonly result: StepOutput | null;
  readonly stepOutputs: Readonly<Record<string, StepOutput>>;
  readonly cancelRequested: boolean;
}

export type WorkflowEventName =
  | 'workflow.started'
  | 'workflow.step_started'
  | 'workflow.step_retry'
  | 'workflow.step_succeeded'
  | 'workflow.step_failed'
  | 'workflow.progress'
  | 'workflow.cancelled'
  | 'workflow.timed_out'
  | 'workflow.completed'
  | 'workflow.recovered'
  | 'workflow.illegal_transition';

export interface WorkflowEvent {
  readonly event: WorkflowEventName;
  readonly runId: WorkflowRunId;
  readonly workflowId: WorkflowId;
  readonly version: number;
  readonly stepId?: string;
  readonly attempt?: number;
  readonly ts: number;
  readonly durationMs?: number;
  readonly progress?: number;
  readonly errorCode?: ErrorCode;
  readonly message?: string;
}

export interface StartOptions {
  readonly idempotencyKey?: string;
  readonly attempt?: number;
  readonly deps?: Readonly<Record<string, unknown>>;
}
