/**
 * Response envelope — contracts/api.md §3.
 *
 *   success  2xx        { ok: true,  requestId, data }
 *   error    4xx/5xx    { ok: false, requestId, error: { code, message, retryable, detail? } }
 *
 * No endpoint returns 200 with substitute content (INV-010).
 */
import type { ErrorRequestHandler, NextFunction, Request, RequestHandler, Response } from 'express';
import { httpStatusFor, isAppError, toAppError } from '../errors';
import type { AppError } from '../errors';
import type { ServerLogger } from './requestContext';

export interface SuccessEnvelope<T> {
  ok: true;
  requestId: string;
  data: T;
}

export interface ErrorEnvelope {
  ok: false;
  requestId: string;
  error: { code: string; message: string; retryable: boolean; detail?: string };
}

export function requestIdOf(req: Request): string {
  return req.requestContext?.requestId ?? '-';
}

export function sendSuccess<T>(res: Response, data: T): void {
  const body: SuccessEnvelope<T> = { ok: true, requestId: requestIdOf(res.req), data };
  res.status(200).json(body);
}

export function sendAppError(res: Response, error: AppError, options: { exposeDetail?: boolean } = {}): void {
  const status = httpStatusFor(error.code);
  const retryAfterSeconds = (error as AppError & { retryAfterSeconds?: number }).retryAfterSeconds;
  if (typeof retryAfterSeconds === 'number' && retryAfterSeconds > 0) {
    res.setHeader('Retry-After', String(retryAfterSeconds));
  }
  res.status(status).json({
    ok: false,
    requestId: requestIdOf(res.req),
    error: {
      code: error.code,
      message: error.message,
      retryable: error.retryable,
      ...(options.exposeDetail && error.detail ? { detail: error.detail } : {}),
    },
  } satisfies ErrorEnvelope);
}

/** Central error handler: every throw becomes a typed envelope, never a 200. */
/** Maps body-parser failures onto typed codes instead of a generic 500. */
function fromBodyParserError(err: unknown): AppError | null {
  const type = (err as { type?: string } | null)?.type;
  if (type === 'entity.parse.failed') {
    return { code: 'VALIDATION_FAILED', message: 'The request body is not valid JSON.', retryable: false };
  }
  if (type === 'entity.too.large') {
    return { code: 'PAYLOAD_TOO_LARGE', message: 'The request body is too large.', retryable: false };
  }
  return null;
}

export function errorHandler(options: {
  logger: ServerLogger;
  exposeDetail?: boolean;
}): ErrorRequestHandler {
  return (err: unknown, req: Request, res: Response, _next: NextFunction): void => {
    const error = isAppError(err) ? err : (fromBodyParserError(err) ?? toAppError(err));
    const context = req.requestContext;
    if (context) context.errorCode = error.code;

    options.logger.error('http.error', {
      requestId: requestIdOf(req),
      path: req.path,
      code: error.code,
      retryable: error.retryable,
      detail: error.detail,
      context: error.context,
    });

    if (res.headersSent) {
      res.end();
      return;
    }
    sendAppError(res, error, { exposeDetail: options.exposeDetail });
  };
}

/** Wraps an async handler so rejections reach the central error handler. */
export function asyncHandler(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    handler(req, res, next).catch(next);
  };
}

/** Typed 404 for unknown `/api/*` paths — the allowlist is closed. */
export function apiNotFound(): RequestHandler {
  return (req, res) => {
    sendAppError(
      res,
      {
        code: 'NOT_FOUND',
        message: 'That API operation does not exist.',
        retryable: false,
        context: { path: req.path },
      },
      {},
    );
  };
}
