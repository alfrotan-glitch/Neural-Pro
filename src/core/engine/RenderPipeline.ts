// src/core/engine/RenderPipeline.ts
import { useExportStore } from '../../store/useExportStore';
import type { ExportJob } from '../../store/useExportStore';

export interface RenderProgress {
  percentage: number;
  timeRemainingSec?: number;
  frame?: number;
  fps?: number;
  speed?: string;
}

export type ExportRenderFunction = (
  job: ExportJob,
  signal: AbortSignal,
  onProgress: (progress: RenderProgress) => void
) => Promise<Blob>;

/**
 * Single owner of queued export execution.
 *
 * The pipeline deliberately does not contain a second encoder implementation.
 * It delegates the actual frame rendering/encoding to the renderer registered
 * by VideoStudioPro, which is backed by the same WebCodecs implementation used
 * by direct Export.
 */
export class RenderPipeline {
  private static instance: RenderPipeline | null = null;

  private renderer: ExportRenderFunction | null = null;
  private readonly controllers = new Map<string, AbortController>();
  private readonly runTokens = new Map<string, number>();
  private executionTail: Promise<void> = Promise.resolve();
  private logs: string[] = [];
  private readonly logListeners = new Set<(logs: string[]) => void>();

  private constructor() {}

  public static getInstance(): RenderPipeline {
    if (!RenderPipeline.instance) {
      RenderPipeline.instance = new RenderPipeline();
    }
    return RenderPipeline.instance;
  }

  public registerRenderer(renderer: ExportRenderFunction): () => void {
    this.renderer = renderer;

    return () => {
      if (this.renderer === renderer) {
        this.renderer = null;
      }
    };
  }

  public subscribeLogs(listener: (logs: string[]) => void): () => void {
    this.logListeners.add(listener);
    listener([...this.logs]);
    return () => this.logListeners.delete(listener);
  }

  public getLogs(): string[] {
    return [...this.logs];
  }

  public clearLogs(): void {
    this.logs = [];
    this.notifyLogListeners();
  }

  public cancelJob(jobId: string): void {
    const controller = this.controllers.get(jobId);
    if (controller) {
      this.bumpRunToken(jobId);
      controller.abort(new Error('Render job cancelled by user command.'));
      this.addPipelineLog(`Cancellation requested for job ${jobId}.`, 'warn');
    } else {
      this.runTokens.delete(jobId);
    }
  }

  /**
   * Queue one job behind the currently executing job. Even if a caller asks
   * for parallel execution, there is still only one encoder owner. This avoids
   * competing WebCodecs encoders and makes resource usage deterministic.
   */
  public renderJob(jobId: string): Promise<boolean> {
    const execution = this.executionTail.then(() => this.executeJob(jobId));
    this.executionTail = execution.then(() => undefined, () => undefined);
    return execution;
  }

  private async executeJob(jobId: string): Promise<boolean> {
    const exportStore = useExportStore.getState();
    const runToken = this.bumpRunToken(jobId);
    const job = exportStore.jobs.find((candidate) => candidate.id === jobId);

    if (!job) {
      this.addPipelineLog(`Job ${jobId} not found in export queue.`, 'error');
      return false;
    }

    if (!job.projectSnapshot || !Array.isArray(job.projectSnapshot.tracks)) {
      this.addPipelineLog(`Job ${jobId} has no valid immutable project snapshot.`, 'error');
      exportStore.updateJob(jobId, {
        status: 'failed',
        endTime: new Date().toLocaleTimeString(),
        error: 'Export job is missing a valid immutable project snapshot.',
        estimatedRemainingTime: 0,
      });
      return false;
    }

    if (job.status !== 'waiting') {
      this.addPipelineLog(`Job ${jobId} is not waiting; current status is ${job.status}.`, 'warn');
      return false;
    }

    if (!this.renderer) {
      const message = 'No production export renderer is registered. Open Video Studio Pro and try again.';
      this.addPipelineLog(message, 'error');
      exportStore.updateJob(jobId, {
        status: 'failed',
        endTime: new Date().toLocaleTimeString(),
        error: message,
        estimatedRemainingTime: 0,
      });
      return false;
    }

    const controller = new AbortController();
    this.controllers.set(jobId, controller);

    if (!this.isCurrentRun(jobId, runToken)) return false;

    exportStore.updateJob(jobId, {
      status: 'preparing',
      progress: 0,
      startTime: new Date().toLocaleTimeString(),
      endTime: undefined,
      error: undefined,
      downloadUrl: undefined,
      estimatedRemainingTime: undefined,
    });

    this.addPipelineLog(
      `Starting production export for "${job.projectName}" (${job.settings.resolution} @ ${job.settings.fps}fps, ${job.settings.codec}, ${job.settings.format.toUpperCase()}).`,
      'info'
    );

    try {
      if (!this.isCurrentRun(jobId, runToken)) return false;
      exportStore.updateJob(jobId, { status: 'rendering', progress: 1 });

      const blob = await this.renderer(job, controller.signal, (progress) => {
        if (controller.signal.aborted) return;

        if (!this.isCurrentRun(jobId, runToken)) return;

        exportStore.updateJob(jobId, {
          progress: Math.min(99, Math.max(1, Math.round(progress.percentage))),
          estimatedRemainingTime: progress.timeRemainingSec,
        });

        if (progress.frame !== undefined) {
          this.addPipelineLog(
            `frame=${progress.frame} progress=${Math.round(progress.percentage)}%${progress.fps ? ` fps=${progress.fps}` : ''}${progress.speed ? ` speed=${progress.speed}` : ''}`,
            'info'
          );
        }
      });

      if (controller.signal.aborted) {
        throw controller.signal.reason instanceof Error
          ? controller.signal.reason
          : new Error('Render job cancelled by user command.');
      }

      const downloadUrl = URL.createObjectURL(blob);
      if (!this.isCurrentRun(jobId, runToken)) {
        URL.revokeObjectURL(downloadUrl);
        return false;
      }

      exportStore.updateJob(jobId, {
        status: 'completed',
        progress: 100,
        endTime: new Date().toLocaleTimeString(),
        downloadUrl,
        estimatedRemainingTime: 0,
      });

      this.addPipelineLog(
        `Export completed successfully for "${job.projectName}". Valid ${blob.type || job.settings.format} Blob created (${blob.size.toLocaleString()} bytes).`,
        'info'
      );
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const cancelled = controller.signal.aborted;

      if (!this.isCurrentRun(jobId, runToken)) return false;

      exportStore.updateJob(jobId, {
        status: cancelled ? 'cancelled' : 'failed',
        endTime: new Date().toLocaleTimeString(),
        error: cancelled ? 'Render job cancelled by user command.' : message,
        estimatedRemainingTime: 0,
      });

      this.addPipelineLog(
        cancelled ? `Export cancelled for "${job.projectName}".` : `Export failed for "${job.projectName}": ${message}`,
        cancelled ? 'warn' : 'error'
      );
      return false;
    } finally {
      if (this.controllers.get(jobId) === controller) {
        this.controllers.delete(jobId);
      }
      if (this.runTokens.get(jobId) === runToken && !controller.signal.aborted) {
        this.runTokens.delete(jobId);
      }
    }
  }


  private bumpRunToken(jobId: string): number {
    const next = (this.runTokens.get(jobId) ?? 0) + 1;
    this.runTokens.set(jobId, next);
    return next;
  }

  private isCurrentRun(jobId: string, runToken: number): boolean {
    return this.runTokens.get(jobId) === runToken;
  }

  private addPipelineLog(message: string, type: 'info' | 'warn' | 'error'): void {
    const formatted = `[${new Date().toLocaleTimeString()}] [PIPELINE] [${type.toUpperCase()}] ${message}`;
    this.logs.push(formatted);
    if (this.logs.length > 200) {
      this.logs.shift();
    }
    this.notifyLogListeners();
  }

  private notifyLogListeners(): void {
    const snapshot = [...this.logs];
    this.logListeners.forEach((listener) => listener(snapshot));
  }
}
