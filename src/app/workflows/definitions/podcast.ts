/**
 * W1 — Podcast script generation (docs/workflows/podcast-generation.md).
 *
 * Replaces `App.tsx:generatePodcast` (~120 lines of imperative `await` inside a
 * click handler with no cancellation, no timeout and no idempotency).
 */
import { createAppError } from '../../../domain/errors/appError';
import type { AppError } from '../../../domain/errors/appError';
import type { AiGateway, ScriptLine, ScriptRequest } from '../../../domain/ai/AiGateway';
import { DEFAULT_RECOVERY_POLICY, DEFAULT_RETRY_POLICY, NO_RETRY_POLICY, TIMEOUT_POLICIES } from '../policies';
import type { WorkflowDefinition, WorkflowStepContext } from '../types';

export const PODCAST_WORKFLOW_VERSION = 1;
export const PODCAST_BATCH_SIZE = 50;

export interface PodcastInput {
  readonly topic: string;
  readonly channelName: string;
  readonly duration: string;
  readonly style: string;
  readonly level: string;
  readonly speakerCount: 'Single Speaker' | 'Dual Speaker';
  readonly audience: string;
  readonly pace: string;
  readonly realism: string;
  readonly hostA?: string;
  readonly hostB?: string;
}

export interface PodcastOutput {
  readonly metadata: { title: string; level: string; estimated_duration: string; youtube_hook: string };
  readonly script: readonly ScriptLine[];
}

export function targetLineCount(duration: string): number {
  if (duration.includes('3-5')) return 60;
  if (duration.includes('10')) return 120;
  if (duration.includes('15')) return 200;
  if (duration.includes('20')) return 260;
  if (duration.includes('25')) return 320;
  if (duration.includes('30')) return 400;
  return 15;
}

export function totalBatchesFor(duration: string): number {
  return Math.max(1, Math.ceil(targetLineCount(duration) / PODCAST_BATCH_SIZE));
}

function validateInput(input: unknown): AppError | null {
  const value = input as Partial<PodcastInput>;
  if (typeof value?.topic !== 'string' || value.topic.trim().length === 0) {
    return createAppError({ code: 'EMPTY_INPUT', message: 'Enter a topic before generating a script.', retryable: false });
  }
  if (value.topic.length > 500) {
    return createAppError({ code: 'OUT_OF_RANGE', message: 'The topic is too long (500 characters maximum).', retryable: false });
  }
  if (typeof value.duration !== 'string' || typeof value.level !== 'string' || typeof value.style !== 'string') {
    return createAppError({ code: 'VALIDATION_FAILED', message: 'The podcast settings are incomplete.', retryable: false });
  }
  if (value.speakerCount !== 'Single Speaker' && value.speakerCount !== 'Dual Speaker') {
    return createAppError({ code: 'VALIDATION_FAILED', message: 'Choose a single or dual speaker setup.', retryable: false });
  }
  return null;
}

async function generateScript(ctx: WorkflowStepContext): Promise<Record<string, unknown>> {
  const gateway = ctx.deps.gateway as AiGateway | undefined;
  if (!gateway) {
    throw createAppError({ code: 'DEPENDENCY_UNAVAILABLE', message: 'The AI gateway is not available.', retryable: false });
  }
  const input = ctx.input as unknown as PodcastInput;
  const totalBatches = totalBatchesFor(input.duration);
  const lines: ScriptLine[] = [];
  let metadata: PodcastOutput['metadata'] | null = null;

  for (let batch = 1; batch <= totalBatches; batch += 1) {
    if (ctx.signal.aborted) throw createAppError({ code: 'CANCELLED', message: 'Cancelled by user.', retryable: false });

    ctx.report(Math.round(((batch - 1) / totalBatches) * 90), `Generating script batch ${batch} of ${totalBatches}…`);

    const request: ScriptRequest = {
      topic: input.topic,
      channelName: input.channelName,
      duration: input.duration,
      style: input.style,
      level: input.level,
      speakerCount: input.speakerCount,
      audience: input.audience,
      pace: input.pace,
      realism: input.realism,
      ...(input.hostA ? { hostA: input.hostA } : {}),
      ...(input.hostB ? { hostB: input.hostB } : {}),
      batch,
      totalBatches,
    };

    const result = await gateway.script(request, ctx.signal);
    if (!metadata) metadata = result.metadata;
    lines.push(...result.script);
  }

  if (!metadata) {
    throw createAppError({
      code: 'AI_RESPONSE_INVALID',
      message: 'The AI service returned an unexpected response.',
      retryable: false,
    });
  }

  ctx.report(90, 'Validating script…');
  return { metadata, script: lines };
}

function validateScript(ctx: WorkflowStepContext): Promise<Record<string, unknown>> {
  const metadata = ctx.input.metadata as PodcastOutput['metadata'] | undefined;
  const script = ctx.input.script as readonly ScriptLine[] | undefined;

  if (!metadata || typeof metadata.title !== 'string') {
    return Promise.reject(
      createAppError({ code: 'AI_RESPONSE_INVALID', message: 'The generated script is missing its metadata.', retryable: false }),
    );
  }
  if (!Array.isArray(script) || script.length === 0) {
    return Promise.reject(
      createAppError({ code: 'AI_RESPONSE_INVALID', message: 'The AI service returned an empty script.', retryable: false }),
    );
  }
  const invalid = script.find((line) => line.speaker !== 'Host A' && line.speaker !== 'Host B');
  if (invalid) {
    return Promise.reject(
      createAppError({
        code: 'AI_RESPONSE_INVALID',
        message: 'The generated script contains an unknown speaker.',
        retryable: false,
        context: { speaker: String(invalid.speaker) },
      }),
    );
  }
  if (script.some((line) => typeof line.text !== 'string' || line.text.trim().length === 0)) {
    return Promise.reject(
      createAppError({ code: 'AI_RESPONSE_INVALID', message: 'The generated script contains an empty line.', retryable: false }),
    );
  }

  ctx.report(100, 'Script ready');
  return Promise.resolve({ metadata, script });
}

export function createPodcastWorkflow(): WorkflowDefinition {
  return {
    id: 'podcast',
    version: PODCAST_WORKFLOW_VERSION,
    validateInput,
    retryPolicy: DEFAULT_RETRY_POLICY,
    timeoutPolicy: TIMEOUT_POLICIES.podcast ?? { runTimeoutMs: 600_000, graceMs: 10_000 },
    recoveryPolicy: DEFAULT_RECOVERY_POLICY,
    maxConcurrent: 1,
    steps: [
      {
        id: 'generateScript',
        name: 'Generate script',
        run: generateScript,
        checkpoint: true,
      },
      {
        id: 'validateScript',
        name: 'Validate script',
        run: validateScript,
        retry: NO_RETRY_POLICY,
      },
    ],
  };
}
