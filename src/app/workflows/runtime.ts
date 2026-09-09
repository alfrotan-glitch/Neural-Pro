/**
 * WorkflowRuntime — the application-level workflow engine (ADR-003).
 *
 * React subscribes to runs; it never owns them. Everything that used to be a
 * `useEffect` acting as an orchestrator is expressed here as an explicit state
 * machine with:
 *
 *   • a normative transition table (illegal transitions are rejected + logged),
 *   • bounded, jittered, allowlisted retry,
 *   • per-step and per-run timeouts,
 *   • cancellation that always reaches a terminal state within `graceMs`,
 *   • idempotency keys (a double click cannot create two runs),
 *   • checkpoints + resume,
 *   • a `RunScope` released on every terminal transition,
 *   • structured events for observability.
 *
 * No polling: the queue advances on state transitions only.
 */
import { createAppError, isAppError, toAppError } from '../../domain/errors/appError';
import type { AppError } from '../../domain/errors/appError';
import { createEventBus } from './events';
import type { WorkflowEventBus, WorkflowEventListener } from './events';
import { createMemoryCheckpointStore, idempotencyKeyFor } from './checkpoints';
import { createRunScope } from './scope';
import { backoffDelayMs, clampProgress, shouldRetry } from './policies';
import { canTransition, isTerminal } from './transitions';
import type {
  Checkpoint,
  CheckpointStore,
  RunScope,
  RunStatus,
  StartOptions,
  StepOutput,
  WorkflowDefinition,
  WorkflowEvent,
  WorkflowRun,
  WorkflowRunId,
  WorkflowStepContext,
  WorkflowStepDef,
} from './types';

export interface WorkflowRuntimeOptions {
  readonly clock?: () => number;
  readonly rng?: () => number;
  readonly events?: WorkflowEventBus;
  readonly checkpoints?: CheckpointStore;
  readonly runIdFactory?: () => WorkflowRunId;
  readonly onEvent?: WorkflowEventListener;
  readonly onError?: (error: unknown, runId: WorkflowRunId) => void;
}

interface MutableRun {
  id: WorkflowRunId;
  workflowId: WorkflowDefinition['id'];
  version: number;
  idempotencyKey: string;
  status: RunStatus;
  currentStepId: string | null;
  attempt: number;
  progress: number;
  phase: string | null;
  startedAt: number;
  endedAt: number | null;
  error: AppError | null;
  checkpoints: Record<string, Checkpoint>;
  result: StepOutput | null;
  stepOutputs: Record<string, StepOutput>;
  cancelRequested: boolean;
  resume: boolean;
  input: Record<string, unknown>;
  deps: Readonly<Record<string, unknown>>;
  controller: AbortController;
  scope: RunScope;
  timers: Set<ReturnType<typeof setTimeout>>;
  startedExecuting: boolean;
}

export interface StartInput {
  readonly resume?: boolean;
}

function snapshot(run: MutableRun): WorkflowRun {
  return {
    id: run.id,
    workflowId: run.workflowId,
    version: run.version,
    idempotencyKey: run.idempotencyKey,
    status: run.status,
    currentStepId: run.currentStepId,
    attempt: run.attempt,
    progress: run.progress,
    phase: run.phase,
    startedAt: run.startedAt,
    endedAt: run.endedAt,
    error: run.error,
    checkpoints: run.checkpoints,
    result: run.result,
    stepOutputs: run.stepOutputs,
    cancelRequested: run.cancelRequested,
  };
}

/**
 * Rejects with the *typed* abort reason when there is one.
 *
 * `createAppError` returns a plain object, not an `Error`, so a naive
 * `reason instanceof Error` check silently downgrades every typed abort
 * (`TIMEOUT`, `EXPIRED`, `CANCELLED`) to `INTERNAL` - which would make step
 * timeouts un-retryable and mislabelled. Preserving the reason keeps
 * `contracts/errors.md` codes intact end to end.
 */
function abortReason(reason: unknown): unknown {
  if (isAppError(reason)) return reason;
  if (reason instanceof Error) return reason;
  return new Error('aborted');
}

export function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortReason(signal.reason));
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(abortReason(signal?.reason));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export class WorkflowRuntime {
  private readonly definitions = new Map<string, WorkflowDefinition>();
  private readonly runs = new Map<WorkflowRunId, MutableRun>();
  private readonly byKey = new Map<string, WorkflowRunId[]>();
  private readonly listeners = new Set<(run: WorkflowRun) => void>();
  private readonly events: WorkflowEventBus;
  private readonly checkpoints: CheckpointStore;
  private readonly clock: () => number;
  private readonly rng: () => number;
  private readonly runIdFactory: () => WorkflowRunId;
  private readonly onError?: (error: unknown, runId: WorkflowRunId) => void;
  private runCounter = 0;
  private disposed = false;

  constructor(options: WorkflowRuntimeOptions = {}) {
    this.clock = options.clock ?? Date.now;
    this.rng = options.rng ?? Math.random;
    this.events = options.events ?? createEventBus();
    this.checkpoints = options.checkpoints ?? createMemoryCheckpointStore();
    this.runIdFactory =
      options.runIdFactory ?? (() => `run_${(this.runCounter += 1).toString(36)}_${this.clock().toString(36)}`);
    this.onError = options.onError;
    if (options.onEvent) this.events.subscribe(options.onEvent);
  }

  /* ------------------------------------------------------------ registration */

  register(definition: WorkflowDefinition): () => void {
    this.definitions.set(definition.id, definition);
    return () => {
      if (this.definitions.get(definition.id) === definition) this.definitions.delete(definition.id);
    };
  }

  getDefinition(workflowId: string): WorkflowDefinition | undefined {
    return this.definitions.get(workflowId);
  }

  /* ------------------------------------------------------------------ events */

  get eventBus(): WorkflowEventBus {
    return this.events;
  }

  subscribe(listener: (run: WorkflowRun) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /* ------------------------------------------------------------------- reads */

  get(runId: WorkflowRunId): WorkflowRun | undefined {
    const run = this.runs.get(runId);
    return run ? snapshot(run) : undefined;
  }

  list(workflowId?: string): WorkflowRun[] {
    return [...this.runs.values()]
      .filter((run) => (workflowId ? run.workflowId === workflowId : true))
      .map(snapshot);
  }

  /** The non-terminal run for a key, if any (idempotency, contract §7). */
  activeRunFor(workflowId: string, idempotencyKey: string): WorkflowRun | undefined {
    const ids = this.byKey.get(idempotencyKey) ?? [];
    for (const id of ids) {
      const run = this.runs.get(id);
      if (run && run.workflowId === workflowId && !isTerminal(run.status)) return snapshot(run);
    }
    return undefined;
  }

  /* ------------------------------------------------------------------- start */

  start(workflowId: string, input: unknown, options: StartOptions & StartInput = {}): WorkflowRun {
    const definition = this.definitions.get(workflowId);
    if (!definition) {
      throw createAppError({
        code: 'NOT_FOUND',
        message: 'That workflow is not registered.',
        retryable: false,
        context: { workflowId },
      });
    }
    if (this.disposed) {
      throw createAppError({ code: 'CANCELLED', message: 'The workflow runtime is shut down.', retryable: false });
    }

    const key = options.idempotencyKey ?? idempotencyKeyFor(workflowId, definition.version, input);
    const existing = this.activeRunFor(workflowId, key);
    if (existing) return existing;

    const run: MutableRun = {
      id: this.runIdFactory(),
      workflowId: definition.id,
      version: definition.version,
      idempotencyKey: key,
      status: 'idle',
      currentStepId: null,
      attempt: options.attempt ?? 1,
      progress: 0,
      phase: null,
      startedAt: this.clock(),
      endedAt: null,
      error: null,
      checkpoints: {},
      result: null,
      stepOutputs: {},
      cancelRequested: false,
      resume: options.resume ?? false,
      deps: options.deps ?? {},
      input: (typeof input === 'object' && input !== null ? { ...(input as Record<string, unknown>) } : { value: input }),
      controller: new AbortController(),
      scope: createRunScope({ onError: (error) => this.onError?.(error, run.id) }),
      timers: new Set(),
      startedExecuting: false,
    };

    this.runs.set(run.id, run);
    this.byKey.set(key, [...(this.byKey.get(key) ?? []), run.id]);

    this.transition(run, 'queued');
    this.emit('workflow.started', run);
    this.notify(run);

    queueMicrotask(() => this.pump());
    return snapshot(run);
  }

  /**
   * Retry creates a **new** run with the same idempotency key and `attempt + 1`
   * (contract §2: terminal states are terminal).
   */
  retry(runId: WorkflowRunId): WorkflowRun | null {
    const previous = this.runs.get(runId);
    if (!previous || !isTerminal(previous.status)) return null;
    if (previous.status === 'succeeded') return null;
    return this.start(previous.workflowId, previous.input, {
      idempotencyKey: previous.idempotencyKey,
      attempt: previous.attempt + 1,
      resume: previous.status === 'failed',
      // A retry is the *same intent* again, so it must keep its collaborators
      // (renderer, gateways). Dropping them made every retry fail with
      // DEPENDENCY_UNAVAILABLE even though the original run had them.
      deps: previous.deps,
    });
  }

  /* ------------------------------------------------------------------ cancel */

  cancel(runId: WorkflowRunId, reason = 'Cancelled by user.'): boolean {
    const run = this.runs.get(runId);
    if (!run || isTerminal(run.status)) return false;

    run.cancelRequested = true;
    run.error = run.error ?? createAppError({ code: 'CANCELLED', message: reason, retryable: false });

    // A queued run that has not started must never start (INV-007a / D-010 case 1).
    if (run.status === 'queued') {
      this.finalise(run, 'cancelled');
      return true;
    }

    // Abort first, then let the step observe it. The grace timer guarantees a
    // terminal state even if a step ignores its signal (INV-007b / D-010 case 2).
    run.controller.abort(createAppError({ code: 'CANCELLED', message: reason, retryable: false }));
    const grace = this.definitionOf(run)?.timeoutPolicy.graceMs ?? 10_000;
    const timer = setTimeout(() => {
      run.timers.delete(timer);
      if (!isTerminal(run.status)) this.finalise(run, 'cancelled');
    }, grace);
    run.timers.add(timer);
    this.notify(run);
    return true;
  }

  /** Cancels every non-terminal run (page unload, runtime shutdown). */
  cancelAll(reason = 'Cancelled.'): number {
    let count = 0;
    for (const run of this.runs.values()) {
      if (!isTerminal(run.status) && this.cancel(run.id, reason)) count += 1;
    }
    return count;
  }

  dispose(): void {
    this.disposed = true;
    this.cancelAll('The workflow runtime was shut down.');
    for (const run of this.runs.values()) {
      for (const timer of run.timers) clearTimeout(timer);
      run.timers.clear();
      // The grace timers are gone, so terminalise anything still in flight: a
      // disposed runtime must never leave a run reported as "running".
      if (!isTerminal(run.status)) this.finalise(run, 'cancelled');
    }
  }

  /* -------------------------------------------------------------- scheduling */

  private pump(): void {
    if (this.disposed) return;
    for (const definition of this.definitions.values()) {
      const max = definition.maxConcurrent ?? 1;
      const active = this.countActive(definition.id);
      let slots = max - active;
      if (slots <= 0) continue;

      for (const run of this.queuedRuns(definition.id)) {
        if (slots <= 0) break;
        if (run.cancelRequested || isTerminal(run.status)) continue;
        slots -= 1;
        run.startedExecuting = true;
        void this.execute(run, definition);
      }
    }
  }

  private countActive(workflowId: string): number {
    let count = 0;
    for (const run of this.runs.values()) {
      if (run.workflowId === workflowId && (run.status === 'validating' || run.status === 'running' || run.status === 'retrying')) {
        count += 1;
      }
    }
    return count;
  }

  private queuedRuns(workflowId: string): MutableRun[] {
    return [...this.runs.values()]
      .filter((run) => run.workflowId === workflowId && run.status === 'queued')
      .sort((a, b) => a.startedAt - b.startedAt);
  }

  private definitionOf(run: MutableRun): WorkflowDefinition | undefined {
    return this.definitions.get(run.workflowId);
  }

  /* ---------------------------------------------------------------- execution */

  private async execute(run: MutableRun, definition: WorkflowDefinition): Promise<void> {
    if (run.cancelRequested) {
      this.finalise(run, 'cancelled');
      return;
    }

    if (!this.transition(run, 'validating')) {
      this.finalise(run, 'failed', createAppError({ code: 'INTERNAL', message: 'The run could not start.', retryable: false }));
      return;
    }

    const inputError = definition.validateInput(run.input);
    if (inputError) {
      this.finalise(run, 'failed', inputError);
      return;
    }
    if (run.cancelRequested) {
      this.finalise(run, 'cancelled');
      return;
    }
    if (!this.transition(run, 'running')) {
      this.finalise(run, 'failed', createAppError({ code: 'INTERNAL', message: 'The run could not start.', retryable: false }));
      return;
    }

    const runTimeout = definition.timeoutPolicy.runTimeoutMs;
    const timeoutTimer = setTimeout(() => {
      run.timers.delete(timeoutTimer);
      if (isTerminal(run.status)) return;
      run.controller.abort(
        createAppError({ code: 'EXPIRED', message: 'The operation took too long and was stopped.', retryable: false }),
      );
      this.emit('workflow.timed_out', run, { errorCode: 'EXPIRED' });
      this.finalise(run, 'expired', createAppError({ code: 'EXPIRED', message: 'The operation took too long and was stopped.', retryable: false }));
    }, runTimeout);
    run.timers.add(timeoutTimer);

    let failure: AppError | null = null;
    const completedSteps: WorkflowStepDef[] = [];

    try {
      for (const step of definition.steps) {
        if (run.cancelRequested) break;
        run.currentStepId = step.id;

        const resumed = run.resume ? this.tryResume(run, definition, step) : undefined;
        if (resumed) {
          run.stepOutputs[step.id] = resumed.output;
          run.checkpoints[step.id] = resumed;
          completedSteps.push(step);
          this.emit('workflow.recovered', run, { stepId: step.id });
          this.notify(run);
          continue;
        }

        const result = await this.runStep(run, definition, step);
        if (run.cancelRequested) break;
        if (!result.ok) {
          failure = result.error;
          this.emit('workflow.step_failed', run, { stepId: step.id, errorCode: result.error.code });
          break;
        }
        run.stepOutputs[step.id] = result.output;
        completedSteps.push(step);
        this.emit('workflow.step_succeeded', run, { stepId: step.id });
        this.notify(run);
      }
    } catch (error) {
      failure = toAppError(error, 'The operation failed unexpectedly.');
    } finally {
      clearTimeout(timeoutTimer);
      run.timers.delete(timeoutTimer);
    }

    if (run.cancelRequested) {
      await this.compensate(run, completedSteps);
      this.finalise(run, 'cancelled');
      return;
    }
    if (failure) {
      await this.compensate(run, completedSteps);
      this.finalise(run, failure.code === 'EXPIRED' ? 'expired' : 'failed', failure);
      return;
    }
    this.finalise(run, 'succeeded');
  }

  private tryResume(run: MutableRun, definition: WorkflowDefinition, step: WorkflowStepDef): Checkpoint | undefined {
    if (!step.checkpoint) return undefined;
    const checkpoint = this.checkpoints.latest(run.idempotencyKey, step.id);
    if (!checkpoint) return undefined;
    const age = this.clock() - checkpoint.createdAt;
    if (age > definition.recoveryPolicy.maxResumeAgeMs) return undefined;
    const validator = definition.validateCheckpoint;
    if (validator && !validator(step.id, checkpoint.output)) return undefined;
    return checkpoint;
  }

  private async runStep(
    run: MutableRun,
    definition: WorkflowDefinition,
    step: WorkflowStepDef,
  ): Promise<{ ok: true; output: StepOutput } | { ok: false; error: AppError }> {
    const policy = step.retry ?? definition.retryPolicy;
    const stepTimeoutMs = step.timeoutMs ?? definition.timeoutPolicy.stepTimeoutMs;
    let attemptsUsed = 0;

    for (;;) {
      const attempt = attemptsUsed + 1;
      const stepController = new AbortController();
      const onRunAbort = () => stepController.abort(run.controller.signal.reason);
      if (run.controller.signal.aborted) stepController.abort(run.controller.signal.reason);
      else run.controller.signal.addEventListener('abort', onRunAbort, { once: true });

      let stepTimer: ReturnType<typeof setTimeout> | undefined;
      if (stepTimeoutMs) {
        stepTimer = setTimeout(() => {
          stepController.abort(createAppError({ code: 'TIMEOUT', message: 'This step took too long.', retryable: true }));
        }, stepTimeoutMs);
        run.timers.add(stepTimer);
      }

      this.emit('workflow.step_started', run, { stepId: step.id, attempt });
      this.notify(run);

      try {
        const ctx: WorkflowStepContext = {
          runId: run.id,
          workflowId: run.workflowId,
          stepId: step.id,
          attempt,
          signal: stepController.signal,
          input: this.stepInput(run),
          deps: run.deps,
          checkpoints: this.checkpoints,
          scope: run.scope,
          report: (progress, message) => this.report(run, progress, message),
        };
        const output = await step.run(ctx);

        if (step.checkpoint) {
          const checkpoint: Checkpoint = {
            runId: run.id,
            workflowId: run.workflowId,
            idempotencyKey: run.idempotencyKey,
            stepId: step.id,
            output,
            createdAt: this.clock(),
          };
          await this.checkpoints.put(checkpoint);
          run.checkpoints[step.id] = checkpoint;
        }
        return { ok: true, output };
      } catch (error) {
        const appErrorValue = this.stepError(error, stepController.signal);
        attemptsUsed += 1;

        if (run.cancelRequested) {
          return { ok: false, error: createAppError({ code: 'CANCELLED', message: 'Cancelled by user.', retryable: false }) };
        }
        if (stepController.signal.aborted && appErrorValue.code === 'TIMEOUT') {
          // Step timeout: retryable only if the policy allows it.
          if (shouldRetry(policy, { ...appErrorValue, code: 'TIMEOUT', retryable: true }, attemptsUsed)) {
            this.emit('workflow.step_retry', run, { stepId: step.id, attempt: attemptsUsed, errorCode: 'TIMEOUT' });
            await this.backoff(run, policy, attemptsUsed);
            if (run.cancelRequested) return { ok: false, error: createAppError({ code: 'CANCELLED', message: 'Cancelled by user.', retryable: false }) };
            continue;
          }
          return { ok: false, error: { ...appErrorValue, code: 'EXPIRED', retryable: false } };
        }
        if (shouldRetry(policy, appErrorValue, attemptsUsed)) {
          this.emit('workflow.step_retry', run, { stepId: step.id, attempt: attemptsUsed, errorCode: appErrorValue.code });
          this.transition(run, 'retrying');
          await this.backoff(run, policy, attemptsUsed);
          if (run.cancelRequested) {
            return { ok: false, error: createAppError({ code: 'CANCELLED', message: 'Cancelled by user.', retryable: false }) };
          }
          if (!this.transition(run, 'running')) {
            // The run reached a terminal state (expiry, shutdown) while we were
            // backing off. Another attempt on a terminal run is an illegal
            // transition: stop and keep the run's real error.
            return {
              ok: false,
              error: run.error ?? createAppError({ code: 'INTERNAL', message: 'The run was stopped.', retryable: false }),
            };
          }
          continue;
        }
        return { ok: false, error: appErrorValue };
      } finally {
        if (stepTimer) {
          clearTimeout(stepTimer);
          run.timers.delete(stepTimer);
        }
        run.controller.signal.removeEventListener('abort', onRunAbort);
      }
    }
  }

  private async backoff(run: MutableRun, policy: NonNullable<WorkflowStepDef['retry']>, attemptsUsed: number): Promise<void> {
    const wait = backoffDelayMs(policy, attemptsUsed, this.rng);
    if (wait <= 0) return;
    try {
      await delay(wait, run.controller.signal);
    } catch {
      // Aborted during backoff: the caller observes `cancelRequested`.
    }
  }

  private async compensate(run: MutableRun, completedSteps: WorkflowStepDef[]): Promise<void> {
    const definition = this.definitionOf(run);
    if (!definition) return;
    for (let index = completedSteps.length - 1; index >= 0; index -= 1) {
      const step = completedSteps[index];
      if (!step?.compensating) continue;
      try {
        await step.compensating({
          runId: run.id,
          workflowId: run.workflowId,
          stepId: step.id,
          attempt: 1,
          signal: run.controller.signal,
          input: this.stepInput(run),
          deps: run.deps,
          checkpoints: this.checkpoints,
          scope: run.scope,
          report: () => undefined,
        });
      } catch (error) {
        this.onError?.(error, run.id);
      }
    }
  }

  /**
   * Types a step failure. When the step's own signal fired, the abort reason is
   * authoritative (step timeout vs. cancellation vs. run expiry) even if the
   * step threw an untyped `Error` while unwinding.
   */
  private stepError(error: unknown, signal: AbortSignal): AppError {
    const typed = toAppError(error, 'This step failed.');
    if (!signal.aborted || typed.code !== 'INTERNAL') return typed;
    if (isAppError(signal.reason)) return signal.reason;
    return createAppError({ code: 'CANCELLED', message: 'The operation was cancelled.', retryable: false, cause: error });
  }

  private stepInput(run: MutableRun): Record<string, unknown> {
    const merged: Record<string, unknown> = { ...run.input };
    for (const output of Object.values(run.stepOutputs)) Object.assign(merged, output);
    return merged;
  }

  /* ------------------------------------------------------------- transitions */

  private transition(run: MutableRun, to: RunStatus): boolean {
    if (!canTransition(run.status, to)) {
      this.emit('workflow.illegal_transition', run, { message: `${run.status} -> ${to}` });
      return false;
    }
    run.status = to;
    this.notify(run);
    return true;
  }

  private report(run: MutableRun, progress: number, message?: string): void {
    const next = clampProgress(progress);
    if (next < run.progress) return; // progress is monotonic within a run
    run.progress = next;
    if (message) run.phase = message;
    this.emit('workflow.progress', run, { progress: next, message });
    this.notify(run);
  }

  private finalise(run: MutableRun, status: Exclude<RunStatus, 'idle' | 'queued' | 'validating' | 'running' | 'retrying'>, error?: AppError): void {
    if (isTerminal(run.status)) return;
    if (!this.transition(run, status)) {
      // Should be unreachable for legal terminal transitions; keep the run honest.
      run.status = status;
    }
    run.endedAt = this.clock();
    if (error) run.error = error;
    run.currentStepId = null;

    // No step may keep running after its run is terminal (INV-007b): the scope is
    // released below, so a still-running step would use freed resources.
    // Cancellation already aborts; this closes the expiry/failure/shutdown paths.
    if (status !== 'succeeded' && !run.controller.signal.aborted) {
      run.controller.abort(
        run.error ?? createAppError({ code: 'CANCELLED', message: 'The run ended.', retryable: false }),
      );
    }

    if (status === 'cancelled') this.emit('workflow.cancelled', run, { errorCode: 'CANCELLED' });
    if (status === 'expired') this.emit('workflow.timed_out', run, { errorCode: 'EXPIRED' });
    if (status === 'succeeded') {
      run.progress = 100;
      run.result = this.lastOutput(run);
      this.emit('workflow.completed', run, { durationMs: run.endedAt - run.startedAt });
    }

    for (const timer of run.timers) clearTimeout(timer);
    run.timers.clear();

    // Resources are released on EVERY terminal transition (contract §8).
    void run.scope.disposeAll().catch((disposeError) => this.onError?.(disposeError, run.id));

    this.notify(run);
    queueMicrotask(() => this.pump());
  }

  private lastOutput(run: MutableRun): StepOutput | null {
    const keys = Object.keys(run.stepOutputs);
    const lastKey = keys[keys.length - 1];
    return lastKey ? run.stepOutputs[lastKey] ?? null : null;
  }

  /* -------------------------------------------------------------- primitives */

  private emit(event: WorkflowEvent['event'], run: MutableRun, extra: Partial<WorkflowEvent> = {}): void {
    this.events.emit({
      event,
      runId: run.id,
      workflowId: run.workflowId,
      version: run.version,
      ts: this.clock(),
      ...(run.currentStepId ? { stepId: run.currentStepId } : {}),
      ...(run.attempt ? { attempt: run.attempt } : {}),
      ...extra,
    });
  }

  private notify(run: MutableRun): void {
    const view = snapshot(run);
    for (const listener of [...this.listeners]) listener(view);
  }
}

/** Process-wide default runtime (React subscribes to this instance). */
let defaultRuntime: WorkflowRuntime | null = null;

export function getWorkflowRuntime(): WorkflowRuntime {
  if (!defaultRuntime) defaultRuntime = new WorkflowRuntime();
  return defaultRuntime;
}

export function setWorkflowRuntime(runtime: WorkflowRuntime): void {
  defaultRuntime = runtime;
}
