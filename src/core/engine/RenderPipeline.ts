/**
 * RenderPipeline — thin adapter over the export workflow runtime (WP-04).
 *
 * Historically this class *was* the dispatch authority: it serialised execution
 * with an `executionTail` promise and tracked "run tokens" to invalidate stale
 * attempts. That token scheme was the root cause of D-010 — `cancelJob` bumped
 * the token *before* aborting, so the catch block's `isCurrentRun` guard skipped
 * the status write and a cancelled job stayed `rendering` forever; for a queued
 * job there was no controller at all, so the job simply ran.
 *
 * Cancellation and status are now owned by `WorkflowRuntime` via
 * `ExportQueueScheduler` (single dispatch authority, ADR-011). This adapter keeps
 * the historical public surface for existing callers.
 */
import { getExportQueue } from '../../app/workflows/export/exportQueue';
import type { ExportRenderFunction } from '../../app/workflows/definitions/export';

export interface RenderProgress {
  percentage: number;
  timeRemainingSec?: number;
  frame?: number;
  fps?: number;
  speed?: string;
}

export type { ExportRenderFunction };

export class RenderPipeline {
  private static instance: RenderPipeline | null = null;

  private constructor() {}

  public static getInstance(): RenderPipeline {
    if (!RenderPipeline.instance) {
      RenderPipeline.instance = new RenderPipeline();
    }
    return RenderPipeline.instance;
  }

  /** Registers the production renderer with the single dispatch authority. */
  public registerRenderer(renderer: ExportRenderFunction): () => void {
    return getExportQueue().registerRenderer(renderer);
  }

  public subscribeLogs(listener: (logs: string[]) => void): () => void {
    return getExportQueue().subscribeLogs(listener);
  }

  public getLogs(): string[] {
    return getExportQueue().getLogs();
  }

  public clearLogs(): void {
    getExportQueue().clearLogs();
  }

  /**
   * Cancel intent. Aborts first, then the runtime writes the terminal state —
   * including for a job that is still queued and has not started (D-010).
   */
  public cancelJob(jobId: string): void {
    getExportQueue().cancel(jobId);
  }

  /** Queue one job behind the currently executing job (runtime concurrency = 1). */
  public renderJob(jobId: string): Promise<boolean> {
    return getExportQueue().enqueue(jobId);
  }
}
