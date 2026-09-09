/**
 * W3 — Captions (docs/workflows/caption.md).
 *
 * Replaces the scattered `fetch` calls in `InspectorEngine.tsx`,
 * `ResourceSidebar.tsx` and `srtImporter.ts`. `projectFps` is mandatory: every
 * `HH:MM:SS:FF` conversion is explicit (D-022).
 */
import { createAppError } from '../../../domain/errors/appError';
import type { AppError } from '../../../domain/errors/appError';
import type { AiGateway, CaptionBlock } from '../../../domain/ai/AiGateway';
import {
  parseCaptionTimestamp,
  secondsToFrameTimecode,
} from '../../../features/video-studio/captions/services/captionTimecodeService';
import { DEFAULT_RECOVERY_POLICY, DEFAULT_RETRY_POLICY, NO_RETRY_POLICY, TIMEOUT_POLICIES } from '../policies';
import type { WorkflowDefinition, WorkflowStepContext } from '../types';

export const CAPTIONS_WORKFLOW_VERSION = 1;

export type CaptionsSource = 'generate' | 'import-srt' | 'refine';

export interface CaptionsInput {
  readonly source: CaptionsSource;
  readonly projectFps: number;
  readonly audioClipName?: string;
  readonly duration?: number;
  readonly topicPrompt?: string;
  readonly srtContent?: string;
  readonly captions?: readonly CaptionBlock[];
  readonly grammarPrompt?: string;
  readonly restorePunctuation?: boolean;
}

function validateInput(input: unknown): AppError | null {
  const value = input as Partial<CaptionsInput>;
  if (typeof value?.projectFps !== 'number' || !Number.isFinite(value.projectFps) || value.projectFps < 1 || value.projectFps > 120) {
    return createAppError({ code: 'VALIDATION_FAILED', message: 'A valid project frame rate is required for captions.', retryable: false });
  }
  if (value.source === 'generate') {
    if (typeof value.audioClipName !== 'string' || value.audioClipName.trim().length === 0) {
      return createAppError({ code: 'EMPTY_INPUT', message: 'Select an audio clip before generating captions.', retryable: false });
    }
    if (typeof value.duration !== 'number' || !(value.duration > 0)) {
      return createAppError({ code: 'OUT_OF_RANGE', message: 'The audio clip has no measurable duration yet.', retryable: false });
    }
    return null;
  }
  if (value.source === 'import-srt') {
    if (typeof value.srtContent !== 'string' || value.srtContent.trim().length === 0) {
      return createAppError({ code: 'EMPTY_INPUT', message: 'The selected SRT file is empty.', retryable: false });
    }
    return null;
  }
  if (value.source === 'refine') {
    if (!Array.isArray(value.captions) || value.captions.length === 0) {
      return createAppError({ code: 'EMPTY_INPUT', message: 'There are no captions to refine yet.', retryable: false });
    }
    return null;
  }
  return createAppError({ code: 'VALIDATION_FAILED', message: 'Unknown caption operation.', retryable: false });
}

async function acquire(ctx: WorkflowStepContext): Promise<Record<string, unknown>> {
  const gateway = ctx.deps.gateway as AiGateway | undefined;
  if (!gateway) {
    throw createAppError({ code: 'DEPENDENCY_UNAVAILABLE', message: 'The AI gateway is not available.', retryable: false });
  }
  const input = ctx.input as unknown as CaptionsInput;
  ctx.report(10, 'Requesting captions…');

  if (input.source === 'generate') {
    const result = await gateway.captions.generate(
      {
        audioClipName: input.audioClipName ?? '',
        duration: input.duration ?? 0,
        topicPrompt: input.topicPrompt ?? '',
        projectFps: input.projectFps,
      },
      ctx.signal,
    );
    return { captions: result.captions, source: result.source };
  }

  if (input.source === 'import-srt') {
    const result = await gateway.captions.parseSrt(
      { srtContent: input.srtContent ?? '', refine: false, projectFps: input.projectFps },
      ctx.signal,
    );
    return { captions: result.captions, source: result.source };
  }

  const result = await gateway.captions.refine(
    {
      captions: input.captions ?? [],
      ...(input.grammarPrompt ? { grammarPrompt: input.grammarPrompt } : {}),
      restorePunctuation: input.restorePunctuation ?? true,
      projectFps: input.projectFps,
    },
    ctx.signal,
  );
  return { captions: result.captions, source: result.source };
}

function validateTiming(ctx: WorkflowStepContext): Promise<Record<string, unknown>> {
  const captions = (ctx.input.captions as readonly CaptionBlock[] | undefined) ?? [];
  const fps = ctx.input.projectFps as number;

  if (captions.length === 0) {
    return Promise.reject(
      createAppError({ code: 'AI_RESPONSE_INVALID', message: 'No captions were returned.', retryable: false }),
    );
  }

  let previousEnd = -1;
  for (let index = 0; index < captions.length; index += 1) {
    const block = captions[index];
    if (!block) continue;
    let start: number;
    let end: number;
    try {
      start = parseCaptionTimestamp(block.start_time, fps);
      end = parseCaptionTimestamp(block.end_time, fps);
    } catch {
      return Promise.reject(
        createAppError({
          code: 'AI_RESPONSE_INVALID',
          message: 'A caption timestamp could not be read.',
          retryable: false,
          context: { index },
        }),
      );
    }
    if (!(end > start)) {
      return Promise.reject(
        createAppError({ code: 'AI_RESPONSE_INVALID', message: 'A caption ends before it starts.', retryable: false, context: { index } }),
      );
    }
    if (start < previousEnd - 1e-6) {
      return Promise.reject(
        createAppError({ code: 'AI_RESPONSE_INVALID', message: 'Captions overlap in time.', retryable: false, context: { index } }),
      );
    }
    previousEnd = end;
  }

  ctx.report(70, 'Caption timing verified');
  return Promise.resolve({ captions });
}

function convertFps(ctx: WorkflowStepContext): Promise<Record<string, unknown>> {
  const captions = (ctx.input.captions as readonly CaptionBlock[] | undefined) ?? [];
  const fps = ctx.input.projectFps as number;

  const normalised = captions.map((block) => ({
    ...block,
    start_time: secondsToFrameTimecode(parseCaptionTimestamp(block.start_time, fps), fps),
    end_time: secondsToFrameTimecode(parseCaptionTimestamp(block.end_time, fps), fps),
  }));

  ctx.report(100, 'Captions ready');
  return Promise.resolve({ captions: normalised, count: normalised.length });
}

export function createCaptionsWorkflow(): WorkflowDefinition {
  return {
    id: 'captions',
    version: CAPTIONS_WORKFLOW_VERSION,
    validateInput,
    retryPolicy: DEFAULT_RETRY_POLICY,
    timeoutPolicy: TIMEOUT_POLICIES.captions ?? { runTimeoutMs: 120_000, graceMs: 5_000 },
    recoveryPolicy: DEFAULT_RECOVERY_POLICY,
    maxConcurrent: 2,
    steps: [
      { id: 'acquire', name: 'Acquire captions', run: acquire, checkpoint: true },
      { id: 'validateTiming', name: 'Validate timing', run: validateTiming, retry: NO_RETRY_POLICY },
      { id: 'convertFps', name: 'Convert to project fps', run: convertFps, retry: NO_RETRY_POLICY },
    ],
  };
}
