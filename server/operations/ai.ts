/**
 * AI operation handlers — the allowlist (WP-01 §2.3).
 *
 * Each handler: validate input → build the request from the server-owned model
 * registry + prompts → bounded upstream call → validate the output → typed
 * result or typed error. There is no branch anywhere in this file that returns
 * content when the AI call failed (INV-010).
 */
import type { Router } from 'express';
import { appError } from '../errors';
import { AI_MODELS } from '../config/models';
import type { AiClient, AiCallContext } from '../ai/geminiClient';
import { requireSession } from '../auth/session';
import type { SessionIssuer } from '../auth/session';
import { ConcurrencyGuard, rateLimit } from '../middleware/rateLimit';
import type { RateLimiter } from '../middleware/rateLimit';
import { asyncHandler, sendSuccess } from '../middleware/respond';
import { describeIssues, parseWith } from '../schemas/schema';
import { SCRIPT_REQUEST_SCHEMA, SPEECH_REQUEST_SCHEMA } from '../schemas/operations';
import type { ScriptRequest, SpeechRequest } from '../schemas/operations';

export interface AiRouteOptions {
  readonly aiClient: AiClient;
  readonly issuer: SessionIssuer;
  readonly limiter: RateLimiter;
  readonly concurrency: ConcurrencyGuard;
  readonly now?: () => number;
}

function ctxOf(req: { requestContext?: { requestId: string }; session?: { sid: string } }, signal?: AbortSignal): AiCallContext {
  return {
    requestId: req.requestContext?.requestId ?? '-',
    tokenId: req.session?.sid ?? '',
    ...(signal ? { signal } : {}),
  };
}

function validationFailed(detail: string) {
  return appError({
    code: 'VALIDATION_FAILED',
    message: 'The request did not match the operation schema.',
    detail,
  });
}

export function registerAiRoutes(router: Router, options: AiRouteOptions): void {
  const rule = {
    perIpPerMinute: AI_MODELS.script.ratePerIpPerMinute,
    perTokenPerMinute: AI_MODELS.script.ratePerTokenPerMinute,
  };
  const speechRule = {
    perIpPerMinute: AI_MODELS.speech.ratePerIpPerMinute,
    perTokenPerMinute: AI_MODELS.speech.ratePerTokenPerMinute,
  };

  router.post(
    '/ai/script',
    requireSession(options.issuer, 'ai:script'),
    rateLimit({ limiter: options.limiter, rule, operation: 'ai.script', now: options.now }),
    asyncHandler(async (req, res) => {
      req.requestContext!.operation = 'ai.script';
      req.requestContext!.model = AI_MODELS.script.id;

      const parsed = parseWith(SCRIPT_REQUEST_SCHEMA, req.body);
      if (!parsed.ok) throw validationFailed(describeIssues(parsed.issues));
      const request = parsed.value as ScriptRequest;

      const data = await options.aiClient.script(request, ctxOf(req, clientAbortSignal(res)));
      sendSuccess(res, { metadata: data.metadata, script: data.script, source: 'gemini' as const });
    }),
  );

  router.post(
    '/ai/speech',
    requireSession(options.issuer, 'ai:speech'),
    rateLimit({ limiter: options.limiter, rule: speechRule, operation: 'ai.speech', now: options.now }),
    asyncHandler(async (req, res) => {
      req.requestContext!.operation = 'ai.speech';
      req.requestContext!.model = AI_MODELS.speech.id;

      const parsed = parseWith(SPEECH_REQUEST_SCHEMA, req.body);
      if (!parsed.ok) throw validationFailed(describeIssues(parsed.issues));
      const request = parsed.value as SpeechRequest;

      if (request.voiceConfig.mode === 'multi' && (!request.voiceConfig.hostA || !request.voiceConfig.hostB)) {
        throw validationFailed('multi-speaker speech requires hostA and hostB voices');
      }
      if (request.voiceConfig.mode === 'single' && !request.voiceConfig.hostA) {
        throw validationFailed('single-speaker speech requires a hostA voice');
      }

      const data = await options.aiClient.speech(request, ctxOf(req, clientAbortSignal(res)));
      sendSuccess(res, { audio: data.audio, source: 'gemini' as const });
    }),
  );
}

/**
 * Client-side cancellation must reach the upstream call: when the connection
 * closes *before the response finished* we abort the in-flight Gemini call
 * (best effort — the AI Studio proxy's cancellation semantics are `P-05`
 * RUNTIME-UNKNOWN, so the client also enforces its own timeout).
 *
 * The `res` `close` event is used deliberately: Node emits `close` on the
 * request once the body has been consumed, which would abort healthy calls.
 */
export function clientAbortSignal(res: {
  on: (event: string, listener: () => void) => void;
  writableFinished: boolean;
}): AbortSignal {
  const controller = new AbortController();
  res.on('close', () => {
    if (!res.writableFinished) controller.abort(new Error('client disconnected'));
  });
  return controller.signal;
}
