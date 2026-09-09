/**
 * Export dispatch authority (ADR-011, WP-04).
 *
 * One owner: this scheduler turns export-store jobs into workflow runs and
 * mirrors run state **one way** into `useExportStore`. There is no polling
 * orchestrator, no component timer and no second dispatch path: the queue
 * advances on run state transitions only (R-014).
 *
 * Cancellation semantics (D-010):
 *   • a queued run records a cancel intent and never starts (case 1);
 *   • a running run is aborted first, then written to a terminal state, and the
 *     runtime's grace timer guarantees that write even if a step ignores its
 *     signal (case 2).
 */
import { useExportStore } from '../../../store/useExportStore';
import type { ExportJob, ExportJobStatus } from '../../../features/video-studio/export/types/settings';
import { getWorkflowRuntime } from '../runtime';
import type { WorkflowRuntime } from '../runtime';
import { createExportWorkflow } from '../definitions/export';
import type { ExportRenderFunction, ExportRenderProgress } from '../definitions/export';
import { isTerminal } from '../transitions';
import type { RunStatus, WorkflowRun, WorkflowRunId } from '../types';

export interface ExportQueueOptions {
  readonly runtime?: WorkflowRuntime;
  /**
   * Extra collaborators handed to every export run (e.g. a `createObjectUrl`
   * implementation). Production passes nothing: the workflow defaults to the
   * browser's own `URL.createObjectURL`.
   */
  readonly deps?: Readonly<Record<string, unknown>>;
}

const RUN_STATUS_TO_JOB: Readonly<Record<RunStatus, ExportJobStatus>> = {
  idle: 'waiting',
  queued: 'waiting',
  validating: 'preparing',
  running: 'rendering',
  retrying: 'rendering',
  succeeded: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
  expired: 'failed',
};

export class ExportQueueScheduler {
  private readonly runtime: WorkflowRuntime;
  private readonly extraDeps: Readonly<Record<string, unknown>>;
  private renderer: ExportRenderFunction | null = null;
  private readonly runByJob = new Map<string, WorkflowRunId>();
  private readonly jobByRun = new Map<WorkflowRunId, string>();
  private readonly pending = new Map<string, ((completed: boolean) => void)[]>();
  private paused = false;
  private unsubscribe: (() => void) | null = null;
  private unregistered: (() => void) | null = null;
  private readonly logListeners = new Set<(logs: string[]) => void>();
  private logs: string[] = [];

  constructor(options: ExportQueueOptions = {}) {
    this.runtime = options.runtime ?? getWorkflowRuntime();
    this.extraDeps = options.deps ?? {};
    if (!this.runtime.getDefinition('export')) {
      this.unregistered = this.runtime.register(createExportWorkflow());
    }
    this.unsubscribe = this.runtime.subscribe((run) => this.mirror(run));
    this.runtime.eventBus.subscribe((event) => {
      if (event.workflowId !== 'export') return;
      this.log(event.message ? `${event.event} ${event.stepId ?? ''} — ${event.message}` : `${event.event} ${event.stepId ?? ''}`.trim());
    });
  }

  /* ------------------------------------------------------------- registration */

  registerRenderer(renderer: ExportRenderFunction): () => void {
    this.renderer = renderer;
    return () => {
      if (this.renderer === renderer) this.renderer = null;
    };
  }

  getRenderer(): ExportRenderFunction | null {
    return this.renderer;
  }

  /* ------------------------------------------------------------------ intents */

  /** Queue one job. Idempotent: the same job cannot create a second run. */
  enqueue(jobId: string): Promise<boolean> {
    const existingRunId = this.runByJob.get(jobId);
    if (existingRunId) {
      const existing = this.runtime.get(existingRunId);
      if (existing && !isTerminal(existing.status)) {
        return this.awaitRun(existingRunId, jobId);
      }
    }

    const job = useExportStore.getState().jobs.find((candidate) => candidate.id === jobId);
    if (!job) {
      this.log(`Job ${jobId} not found in export queue.`, 'error');
      return Promise.resolve(false);
    }
    if (job.status !== 'waiting') {
      this.log(`Job ${jobId} is not waiting; current status is ${job.status}.`, 'warn');
      return Promise.resolve(false);
    }
    if (!job.projectSnapshot || !Array.isArray(job.projectSnapshot.tracks)) {
      this.failJob(jobId, 'Export job is missing a valid immutable project snapshot.');
      return Promise.resolve(false);
    }
    if (!this.renderer) {
      this.failJob(jobId, 'No production export renderer is registered. Open Video Studio Pro and try again.');
      return Promise.resolve(false);
    }

    const run = this.runtime.start(
      'export',
      { jobId, job },
      {
        idempotencyKey: `export:job:${jobId}`,
        deps: { renderer: this.renderer as ExportRenderFunction, ...this.extraDeps },
      },
    );

    this.runByJob.set(jobId, run.id);
    this.jobByRun.set(run.id, jobId);
    this.log(
      `Starting production export for "${job.projectName}" (${job.settings.resolution} @ ${job.settings.fps}fps, ${job.settings.codec}, ${String(job.settings.format).toUpperCase()}).`,
    );

    if (isTerminal(run.status)) return Promise.resolve(run.status === 'succeeded');
    return this.awaitRun(run.id, jobId);
  }

  /** Cancel intent. Returns false when the job is already terminal/unknown. */
  cancel(jobId: string, reason = 'Render job cancelled by user command.'): boolean {
    const runId = this.runByJob.get(jobId);
    if (!runId) {
      // Nothing was dispatched yet: mark it cancelled so it cannot be started.
      const job = useExportStore.getState().jobs.find((candidate) => candidate.id === jobId);
      if (!job || job.status === 'completed' || job.status === 'failed' || job.status === 'cancelled') return false;
      useExportStore.getState().updateJob(jobId, {
        status: 'cancelled',
        endTime: new Date().toLocaleTimeString(),
        estimatedRemainingTime: 0,
      });
      this.log(`Cancellation requested for job ${jobId}.`, 'warn');
      return true;
    }
    const cancelled = this.runtime.cancel(runId, reason);
    if (cancelled) this.log(`Cancellation requested for job ${jobId}.`, 'warn');
    return cancelled;
  }

  /** Explicit retry: a **new** run with the same idempotency key, attempt + 1. */
  retry(jobId: string): Promise<boolean> | null {
    const runId = this.runByJob.get(jobId);
    if (!runId) return null;
    const previous = this.runtime.get(runId);
    if (!previous || !isTerminal(previous.status) || previous.status === 'succeeded') return null;

    useExportStore.getState().retryJob(jobId);
    const next = this.runtime.retry(runId);
    if (!next) return null;
    this.runByJob.set(jobId, next.id);
    this.jobByRun.set(next.id, jobId);
    return this.awaitRun(next.id, jobId);
  }

  remove(jobId: string): void {
    this.cancel(jobId, 'Render job removed from the queue.');
    this.runByJob.delete(jobId);
    useExportStore.getState().removeJob(jobId);
  }

  clearQueue(): void {
    for (const jobId of [...this.runByJob.keys()]) this.cancel(jobId, 'Export queue cleared.');
    this.runByJob.clear();
    useExportStore.getState().clearQueue();
  }

  /** Pause only stops *new* dispatch; it never kills an in-flight render. */
  pause(): void {
    this.paused = true;
  }

  resume(): void {
    this.paused = false;
    this.pumpWaiting();
  }

  /**
   * Dispatches waiting jobs without polling: called on resume and after every
   * terminal transition. The runtime's `maxConcurrent: 1` keeps execution serial.
   */
  pumpWaiting(): void {
    if (this.paused) return;
    const jobs = useExportStore.getState().jobs;
    const next = [...jobs].reverse().find((job) => job.status === 'waiting');
    if (!next) return;
    void this.enqueue(next.id);
  }

  get isPaused(): boolean {
    return this.paused;
  }

  activeRunFor(jobId: string): WorkflowRun | undefined {
    const runId = this.runByJob.get(jobId);
    return runId ? this.runtime.get(runId) : undefined;
  }

  /* --------------------------------------------------------------------- logs */

  subscribeLogs(listener: (logs: string[]) => void): () => void {
    this.logListeners.add(listener);
    listener([...this.logs]);
    return () => this.logListeners.delete(listener);
  }

  getLogs(): string[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
    this.notifyLogListeners();
  }

  dispose(): void {
    this.unsubscribe?.();
    this.unregistered?.();
    this.unsubscribe = null;
    this.unregistered = null;
    this.logListeners.clear();
  }

  /* ------------------------------------------------------------------ mirroring */

  /** One-way mirror: runtime → store. The runtime is the only status authority. */
  private mirror(run: WorkflowRun): void {
    const jobId = this.jobByRun.get(run.id);
    if (!jobId) return;
    const store = useExportStore.getState();
    const job = store.jobs.find((candidate) => candidate.id === jobId);
    if (!job) {
      // The job was removed (or the queue cleared) while its run was in flight.
      // The run still reached a terminal state, so any awaiting caller must
      // settle instead of hanging forever.
      if (isTerminal(run.status)) this.settlePending(jobId, run.status === 'succeeded');
      return;
    }

    const status = RUN_STATUS_TO_JOB[run.status];

    if (run.status === 'succeeded') {
      const result = run.result as { downloadUrl?: string; fileName?: string } | null;
      store.updateJob(jobId, {
        status,
        progress: 100,
        endTime: new Date().toLocaleTimeString(),
        error: undefined,
        estimatedRemainingTime: 0,
        downloadUrl: result?.downloadUrl,
      });
      this.log(`Export completed successfully for "${job.projectName}".`, 'info');
      this.settlePending(jobId, true);
      this.pumpWaiting();
      return;
    }

    if (run.status === 'failed' || run.status === 'expired') {
      const message =
        run.error?.message ??
        (run.status === 'expired' ? 'Export exceeded its time limit and was stopped.' : 'Export failed.');
      store.updateJob(jobId, {
        status,
        endTime: new Date().toLocaleTimeString(),
        error: message,
        estimatedRemainingTime: 0,
      });
      this.log(`Export failed for "${job.projectName}": ${message}`, 'error');
      this.settlePending(jobId, false);
      this.pumpWaiting();
      return;
    }

    if (run.status === 'cancelled') {
      store.updateJob(jobId, {
        status,
        endTime: new Date().toLocaleTimeString(),
        error: run.error?.message ?? 'Render job cancelled by user command.',
        estimatedRemainingTime: 0,
      });
      this.log(`Export cancelled for "${job.projectName}".`, 'warn');
      this.settlePending(jobId, false);
      this.pumpWaiting();
      return;
    }

    store.updateJob(jobId, {
      status,
      ...(run.status === 'running' || run.status === 'retrying' ? { startTime: job.startTime ?? new Date().toLocaleTimeString() } : {}),
      progress: Math.min(99, Math.max(job.status === 'waiting' ? 0 : 1, run.progress)),
      ...(run.phase ? { estimatedRemainingTime: undefined } : {}),
    });
  }

  private awaitRun(runId: WorkflowRunId, jobId: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const current = this.runtime.get(runId);
      if (current && isTerminal(current.status)) {
        resolve(current.status === 'succeeded');
        return;
      }
      // Every caller awaiting the same run must settle: enqueue is idempotent, so
      // a second caller must not orphan the first caller's promise.
      this.pending.set(jobId, [...(this.pending.get(jobId) ?? []), resolve]);
    });
  }

  private settlePending(jobId: string, completed: boolean): void {
    const waiters = this.pending.get(jobId);
    if (!waiters) return;
    this.pending.delete(jobId);
    for (const resolve of waiters) resolve(completed);
  }

  private failJob(jobId: string, message: string): void {
    useExportStore.getState().updateJob(jobId, {
      status: 'failed',
      endTime: new Date().toLocaleTimeString(),
      error: message,
      estimatedRemainingTime: 0,
    });
    this.log(message, 'error');
  }

  private log(message: string, type: 'info' | 'warn' | 'error' = 'info'): void {
    const formatted = `[${new Date().toLocaleTimeString()}] [PIPELINE] [${type.toUpperCase()}] ${message}`;
    this.logs.push(formatted);
    if (this.logs.length > 200) this.logs.shift();
    this.notifyLogListeners();
  }

  private notifyLogListeners(): void {
    const snapshot = [...this.logs];
    this.logListeners.forEach((listener) => listener(snapshot));
  }
}

let scheduler: ExportQueueScheduler | null = null;

export function getExportQueue(): ExportQueueScheduler {
  if (!scheduler) scheduler = new ExportQueueScheduler();
  return scheduler;
}

export function setExportQueue(next: ExportQueueScheduler): void {
  scheduler?.dispose();
  scheduler = next;
}

export type { ExportRenderProgress };
