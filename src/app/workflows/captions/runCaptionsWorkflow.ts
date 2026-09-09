/**
 * W3 entry point for UI callers.
 *
 * The caption UI no longer performs `fetch` calls inside event handlers: it starts
 * a workflow run and awaits its terminal state, so caption operations get the
 * same timeout, bounded retry, cancellation, idempotency and structured events as
 * every other operation.
 */
import { createAppError } from '../../../domain/errors/appError';
import type { AppError } from '../../../domain/errors/appError';
import type { CaptionBlock } from '../../../domain/ai/AiGateway';
import { getAiGateway } from '../../../infra/ai/HttpAiGateway';
import { getWorkflowRuntime } from '../runtime';
import { createCaptionsWorkflow } from '../definitions/captions';
import type { CaptionsInput } from '../definitions/captions';
import { isTerminal } from '../transitions';

export interface RunCaptionsOptions {
  readonly signal?: AbortSignal;
  readonly idempotencyKey?: string;
}

export function ensureCaptionsWorkflowRegistered(): void {
  const runtime = getWorkflowRuntime();
  if (!runtime.getDefinition('captions')) runtime.register(createCaptionsWorkflow());
}

export function runCaptions(input: CaptionsInput, options: RunCaptionsOptions = {}): Promise<readonly CaptionBlock[]> {
  ensureCaptionsWorkflowRegistered();
  const runtime = getWorkflowRuntime();

  const run = runtime.start('captions', input, {
    ...(options.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : {}),
    deps: { gateway: getAiGateway() },
  });

  return new Promise<readonly CaptionBlock[]>((resolve, reject) => {
    const finish = (error?: AppError, captions?: readonly CaptionBlock[]) => {
      unsubscribe();
      if (options.signal) options.signal.removeEventListener('abort', onAbort);
      if (error) reject(error);
      else resolve(captions ?? []);
    };

    const onAbort = () => {
      runtime.cancel(run.id, 'Caption operation cancelled.');
    };

    const unsubscribe = runtime.subscribe((updated) => {
      if (updated.id !== run.id || !isTerminal(updated.status)) return;
      if (updated.status === 'succeeded') {
        const result = updated.result as { captions?: readonly CaptionBlock[] } | null;
        finish(undefined, result?.captions ?? []);
        return;
      }
      finish(
        updated.error ??
          createAppError({
            code: updated.status === 'cancelled' ? 'CANCELLED' : 'INTERNAL',
            message: 'The caption operation did not complete.',
            retryable: false,
          }),
      );
    });

    if (options.signal) {
      if (options.signal.aborted) {
        onAbort();
        return;
      }
      options.signal.addEventListener('abort', onAbort, { once: true });
    }

    // A run can already be terminal when start() returns an existing run.
    const current = runtime.get(run.id);
    if (current && isTerminal(current.status)) {
      if (current.status === 'succeeded') {
        const result = current.result as { captions?: readonly CaptionBlock[] } | null;
        finish(undefined, result?.captions ?? []);
      } else {
        finish(
          current.error ??
            createAppError({ code: 'INTERNAL', message: 'The caption operation did not complete.', retryable: false }),
        );
      }
    }
  });
}
