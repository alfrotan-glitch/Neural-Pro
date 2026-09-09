/**
 * Caption operations — W3 (generate / refine / parse-srt / export-srt).
 *
 * `projectFps` is mandatory on every route (D-022): all `HH:MM:SS:FF`
 * conversions use it, and no default frame rate exists anywhere.
 *
 * Local SRT parsing and SRT export are **not** AI operations: they run without a
 * key. Refinement is an AI operation and returns `503 AI_NOT_CONFIGURED` when no
 * key exists — it never falls back to a heuristic rewrite presented as success.
 */
import type { Router } from 'express';
import { appError } from '../errors';
import { AI_MODELS } from '../config/models';
import type { AiClient } from '../ai/geminiClient';
import { requireSession } from '../auth/session';
import type { SessionIssuer } from '../auth/session';
import { rateLimit } from '../middleware/rateLimit';
import type { RateLimiter } from '../middleware/rateLimit';
import { asyncHandler, sendSuccess } from '../middleware/respond';
import { describeIssues, parseWith } from '../schemas/schema';
import {
  CAPTIONS_EXPORT_SRT_SCHEMA,
  CAPTIONS_GENERATE_SCHEMA,
  CAPTIONS_PARSE_SRT_SCHEMA,
  CAPTIONS_REFINE_SCHEMA,
} from '../schemas/operations';
import type {
  CaptionsExportSrtRequest,
  CaptionsGenerateRequest,
  CaptionsParseSrtRequest,
  CaptionsRefineRequest,
} from '../schemas/operations';
import {
  assertCaptionTiming,
  assertRefinementIsTextOnly,
  exportToSrtString,
  parseSrtContent,
  toFrameTimecodes,
} from '../captions/srt';
import { clientAbortSignal } from './ai';

export interface CaptionsRouteOptions {
  readonly aiClient: AiClient;
  readonly issuer: SessionIssuer;
  readonly limiter: RateLimiter;
  readonly now?: () => number;
}

function sessionIdOf(req: unknown): string {
  return (req as { session?: { sid?: string } }).session?.sid ?? '';
}

function validationFailed(detail: string) {
  return appError({
    code: 'VALIDATION_FAILED',
    message: 'The request did not match the operation schema.',
    detail,
  });
}

export function registerCaptionRoutes(router: Router, options: CaptionsRouteOptions): void {
  const rule = {
    perIpPerMinute: AI_MODELS.captions.ratePerIpPerMinute,
    perTokenPerMinute: AI_MODELS.captions.ratePerTokenPerMinute,
  };
  const auth = requireSession(options.issuer, 'captions');
  const limit = rateLimit({ limiter: options.limiter, rule, operation: 'captions', now: options.now });

  router.post(
    '/captions/generate',
    auth,
    limit,
    asyncHandler(async (req, res) => {
      req.requestContext!.operation = 'captions.generate';
      req.requestContext!.model = AI_MODELS.captions.id;

      const parsed = parseWith(CAPTIONS_GENERATE_SCHEMA, req.body);
      if (!parsed.ok) throw validationFailed(describeIssues(parsed.issues));
      const request = parsed.value as CaptionsGenerateRequest;

      const captions = await options.aiClient.captionsGenerate(request, {
        requestId: req.requestContext?.requestId ?? '-',
        tokenId: sessionIdOf(req),
        signal: clientAbortSignal(res),
      });
      assertCaptionTiming(captions, request.projectFps);
      sendSuccess(res, { captions: toFrameTimecodes(captions, request.projectFps), source: 'gemini' as const });
    }),
  );

  router.post(
    '/captions/refine',
    auth,
    limit,
    asyncHandler(async (req, res) => {
      req.requestContext!.operation = 'captions.refine';
      req.requestContext!.model = AI_MODELS.captions.id;

      const parsed = parseWith(CAPTIONS_REFINE_SCHEMA, req.body);
      if (!parsed.ok) throw validationFailed(describeIssues(parsed.issues));
      const request = parsed.value as CaptionsRefineRequest;
      assertCaptionTiming(request.captions, request.projectFps);

      const refined = await options.aiClient.captionsRefine(request, {
        requestId: req.requestContext?.requestId ?? '-',
        tokenId: sessionIdOf(req),
        signal: clientAbortSignal(res),
      });
      assertRefinementIsTextOnly(request.captions, refined);
      assertCaptionTiming(refined, request.projectFps);

      sendSuccess(res, { captions: refined, source: 'gemini' as const });
    }),
  );

  router.post(
    '/captions/parse-srt',
    auth,
    limit,
    asyncHandler(async (req, res) => {
      req.requestContext!.operation = 'captions.parse-srt';

      const parsed = parseWith(CAPTIONS_PARSE_SRT_SCHEMA, req.body);
      if (!parsed.ok) throw validationFailed(describeIssues(parsed.issues));
      const request = parsed.value as CaptionsParseSrtRequest;

      const captions = parseSrtContent(request.srtContent, request.projectFps);
      if (captions.length === 0) {
        throw appError({
          code: 'EMPTY_INPUT',
          message: 'No valid SRT caption blocks were found in that file.',
        });
      }

      if (!request.refine) {
        sendSuccess(res, { captions, source: 'srt' as const, refined: false });
        return;
      }

      // Refinement is an AI operation. Without a key this is a real failure that
      // the caller can see — the lossless parse is returned separately so the UI
      // can offer it explicitly, but the response is not `ok`.
      if (!options.aiClient.configured) {
        throw appError({
          code: 'AI_NOT_CONFIGURED',
          message: 'AI features are not configured on this server, so captions cannot be refined.',
          context: { parsedBlocks: captions.length },
        });
      }

      const refined = await options.aiClient.captionsRefine(
        { captions, projectFps: request.projectFps, restorePunctuation: true },
        {
          requestId: req.requestContext?.requestId ?? '-',
          tokenId: sessionIdOf(req),
          signal: clientAbortSignal(res),
        },
      );
      assertRefinementIsTextOnly(captions, refined);
      sendSuccess(res, { captions: refined, source: 'gemini' as const, refined: true });
    }),
  );

  router.post(
    '/captions/export-srt',
    auth,
    limit,
    asyncHandler(async (req, res) => {
      req.requestContext!.operation = 'captions.export-srt';

      const parsed = parseWith(CAPTIONS_EXPORT_SRT_SCHEMA, req.body);
      if (!parsed.ok) throw validationFailed(describeIssues(parsed.issues));
      const request = parsed.value as CaptionsExportSrtRequest;
      assertCaptionTiming(request.captions, request.projectFps);

      const srt = exportToSrtString(request.captions, request.projectFps);
      sendSuccess(res, { srt, source: 'local' as const });
    }),
  );
}
