/**
 * W4 — Export (docs/workflows/export.md, ADR-011, ADR-016).
 *
 * The browser stays the render authority (Strategy A); what changes is that the
 * job now has a real lifecycle: one dispatch authority, cancellation that always
 * reaches a terminal state, idempotency per job, observable progress and a
 * delivery step that fails loudly instead of reporting a file nobody received.
 */
import { createAppError, isAppError } from '../../../domain/errors/appError';
import type { AppError } from '../../../domain/errors/appError';
import type { ExportJob } from '../../../features/video-studio/export/types/settings';
import { DEFAULT_RECOVERY_POLICY, NO_RETRY_POLICY, TIMEOUT_POLICIES } from '../policies';
import type { WorkflowDefinition, WorkflowStepContext } from '../types';

export const EXPORT_WORKFLOW_VERSION = 1;

export interface ExportRenderProgress {
  readonly percentage: number;
  readonly timeRemainingSec?: number;
  readonly frame?: number;
  readonly fps?: number;
  readonly speed?: string;
}

export type ExportRenderFunction = (
  job: ExportJob,
  signal: AbortSignal,
  onProgress: (progress: ExportRenderProgress) => void,
) => Promise<Blob>;

export interface ExportInput {
  readonly jobId: string;
  readonly job: ExportJob;
}

export interface ExportOutput {
  readonly blob: Blob;
  readonly downloadUrl: string;
  readonly fileName: string;
  readonly durationMs: number;
}

/**
 * Renderer failures are first-party text, but `AppError.message` must stay safe
 * for end users (contracts/errors.md §1): paths, URLs and credential-looking
 * fragments are stripped before surfacing, and the raw text is kept in `detail`.
 */
export function renderFailure(error: unknown, jobId: string): AppError {
  const raw = error instanceof Error ? error.message : String(error ?? '');
  const safe = raw
    .replace(/https?:\/\/\S+/gi, '[url]')
    .replace(/(?:[a-zA-Z]:)?[\\/][^\s'"`]+/g, '[path]')
    .replace(/(?:key|token|secret|authorization|password)\s*[:=]\s*\S+/gi, '[redacted]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
  return createAppError({
    code: 'RENDER_FAILED',
    message: safe || 'The export renderer failed.',
    detail: raw.slice(0, 500),
    retryable: false,
    context: { jobId },
    cause: error,
  });
}

function fileNameFor(job: ExportJob): string {
  const safe = job.projectName.replace(/[^\w\-. ]+/g, '').trim() || 'neural-pro-export';
  return `${safe}.${job.settings.format}`;
}

function validateInput(input: unknown): AppError | null {
  const value = input as Partial<ExportInput>;
  if (typeof value?.jobId !== 'string' || value.jobId.length === 0) {
    return createAppError({ code: 'VALIDATION_FAILED', message: 'The export job has no identifier.', retryable: false });
  }
  const job = value.job;
  if (!job || !job.projectSnapshot || !Array.isArray(job.projectSnapshot.tracks)) {
    return createAppError({
      code: 'VALIDATION_FAILED',
      message: 'Export job is missing a valid immutable project snapshot.',
      retryable: false,
      context: { jobId: value.jobId ?? '' },
    });
  }
  if (!job.settings || typeof job.settings.resolution !== 'string' || !(Number(job.settings.fps) > 0)) {
    return createAppError({ code: 'VALIDATION_FAILED', message: 'The export settings are incomplete.', retryable: false });
  }
  return null;
}

async function render(ctx: WorkflowStepContext): Promise<Record<string, unknown>> {
  const renderer = ctx.deps.renderer as ExportRenderFunction | undefined;
  if (!renderer) {
    throw createAppError({
      code: 'DEPENDENCY_UNAVAILABLE',
      message: 'No production export renderer is registered. Open Video Studio Pro and try again.',
      retryable: false,
    });
  }
  const input = ctx.input as unknown as ExportInput;
  ctx.report(1, 'Preparing export…');

  let blob: Blob;
  try {
    blob = await renderer(input.job, ctx.signal, (progress) => {
      if (ctx.signal.aborted) return;
      ctx.report(
        Math.min(99, Math.max(1, Math.round(progress.percentage))),
        progress.frame !== undefined
          ? `frame=${progress.frame}${progress.fps ? ` fps=${progress.fps}` : ''}${progress.speed ? ` speed=${progress.speed}` : ''}`
          : undefined,
      );
    });
  } catch (error) {
    // A cancellation must stay a cancellation; anything else is a typed render
    // failure carrying the renderer's own reason (never a fabricated success).
    if (ctx.signal.aborted) {
      throw createAppError({ code: 'CANCELLED', message: 'Cancelled by user.', retryable: false });
    }
    if (isAppError(error)) throw error;
    throw renderFailure(error, input.jobId);
  }

  if (ctx.signal.aborted) {
    throw createAppError({ code: 'CANCELLED', message: 'Cancelled by user.', retryable: false });
  }
  // The fabricated-success case is a renderer that hands back nothing usable:
  // no object, a non-Blob, or a nonsense size. That is a real failure.
  if (!(blob instanceof Blob) || !Number.isFinite(blob.size) || blob.size < 0) {
    throw createAppError({
      code: 'RENDER_FAILED',
      message: 'The renderer produced no video data.',
      retryable: false,
      context: { jobId: input.jobId },
    });
  }

  // A zero-length file is the renderer's own output, and the documented
  // invariant is delivery honesty (AS-INV-14), not content policy - so it is
  // delivered and reported, never silently presented as a normal export.
  if (blob.size === 0) {
    ctx.report(99, 'Warning: the renderer returned an empty file.');
  } else {
    ctx.report(99, 'Finalising…');
  }
  return { blob };
}

/**
 * Delivery with ordered fallbacks. Failure of every mechanism is a typed
 * `RENDER_FAILED` (phase `delivery`) — never a `completed` job (AS-INV-14).
 */
async function deliver(ctx: WorkflowStepContext): Promise<Record<string, unknown>> {
  const input = ctx.input as unknown as ExportInput;
  const blob = ctx.input.blob as Blob | undefined;
  if (!blob) {
    throw createAppError({ code: 'RENDER_FAILED', message: 'There is no rendered video to deliver.', retryable: false });
  }

  const urlFactory = (ctx.deps.createObjectUrl as ((value: Blob) => string) | undefined) ??
    ((value: Blob) => URL.createObjectURL(value));

  let downloadUrl: string;
  try {
    downloadUrl = urlFactory(blob);
  } catch (error) {
    throw createAppError({
      code: 'RENDER_FAILED',
      message: 'The rendered video could not be delivered to the browser.',
      retryable: false,
      detail: error instanceof Error ? error.message : String(error),
      context: { jobId: input.jobId, phase: 'delivery' },
    });
  }
  if (typeof downloadUrl !== 'string' || downloadUrl.length === 0) {
    throw createAppError({
      code: 'RENDER_FAILED',
      message: 'The rendered video could not be delivered to the browser.',
      retryable: false,
      context: { jobId: input.jobId, phase: 'delivery' },
    });
  }

  // The run owns the object URL until the job is removed or replaced; the export
  // store revokes it there (single owner, no double-free).
  ctx.report(100, 'Delivered');
  return { blob, downloadUrl, fileName: fileNameFor(input.job) };
}

export function createExportWorkflow(): WorkflowDefinition {
  return {
    id: 'export',
    version: EXPORT_WORKFLOW_VERSION,
    validateInput,
    // Rendering is deterministic and expensive: a failed render is surfaced, not
    // silently repeated (R-031). Retrying stays an explicit user intent.
    retryPolicy: NO_RETRY_POLICY,
    timeoutPolicy: TIMEOUT_POLICIES.export ?? { runTimeoutMs: 30 * 60 * 1000, graceMs: 10_000 },
    recoveryPolicy: { ...DEFAULT_RECOVERY_POLICY, strategy: 'restart' },
    maxConcurrent: 1,
    steps: [
      { id: 'render', name: 'Render frames', run: render },
      { id: 'deliver', name: 'Deliver file', run: deliver, retry: NO_RETRY_POLICY },
    ],
  };
}
