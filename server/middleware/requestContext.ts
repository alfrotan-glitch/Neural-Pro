/**
 * Request context: requestId, structured logging and security headers
 * (contracts/api.md §3/§8/§9, security/security-model.md §9).
 *
 * One structured line per request. Never request/response bodies, never keys.
 */
import crypto from 'crypto';
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import type { SessionClaims } from '../auth/session';

export interface StructuredLogLine {
  readonly ts: string;
  readonly level: 'info' | 'warn' | 'error';
  readonly event: string;
  readonly requestId: string;
  readonly [key: string]: unknown;
}

export interface ServerLogger {
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
}

export interface RequestLogContext {
  requestId: string;
  startedAt: number;
  operation?: string;
  model?: string;
  errorCode?: string;
}

declare module 'http' {
  interface IncomingMessage {
    requestContext?: RequestLogContext;
  }
}

const SECRET_PATTERN = /(api[_-]?key|authorization|secret|token|bearer)\s*[:=]\s*\S+/gi;

export function redactSecrets(value: string): string {
  return value.replace(SECRET_PATTERN, '$1=***');
}

export function createLogger(options: {
  write?: (line: string) => void;
  now?: () => number;
} = {}): ServerLogger {
  const write = options.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const now = options.now ?? Date.now;

  const emit = (level: StructuredLogLine['level'], event: string, fields: Record<string, unknown> = {}) => {
    const line: StructuredLogLine = { ts: new Date(now()).toISOString(), level, event, requestId: '-', ...fields };
    write(redactSecrets(JSON.stringify(line)));
  };

  return {
    info: (event, fields) => emit('info', event, fields),
    warn: (event, fields) => emit('warn', event, fields),
    error: (event, fields) => emit('error', event, fields),
  };
}

export function newRequestId(): string {
  return `req_${crypto.randomBytes(8).toString('hex')}`;
}

/** Assigns/echoes `X-Request-Id` and emits exactly one completion line. */
export function requestContext(options: {
  logger: ServerLogger;
  now?: () => number;
}): RequestHandler {
  const now = options.now ?? Date.now;

  return (req: Request, res: Response, next: NextFunction): void => {
    const incoming = req.header('x-request-id');
    const requestId =
      incoming && /^[A-Za-z0-9_-]{4,64}$/.test(incoming) ? incoming : newRequestId();

    const context: RequestLogContext = { requestId, startedAt: now() };
    req.requestContext = context;
    res.setHeader('X-Request-Id', requestId);

    res.on('finish', () => {
      const session = (req as Request & { session?: SessionClaims }).session;
      options.logger.info('http.request', {
        requestId,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        durationMs: now() - context.startedAt,
        ip: req.ip || req.socket.remoteAddress || 'unknown',
        tokenId: session?.sid,
        operation: context.operation,
        model: context.model,
        errorCode: context.errorCode,
      });
    });

    next();
  };
}

/** Security headers for every response (contracts/api.md §8). */
export function securityHeaders(options: { secure: boolean } = { secure: false }): RequestHandler {
  return (_req: Request, res: Response, next: NextFunction): void => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
        "media-src 'self' blob: data:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; " +
        "frame-ancestors 'none'",
    );
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    if (options.secure) {
      res.setHeader('Strict-Transport-Security', 'max-age=63072000; includeSubDomains');
    }
    next();
  };
}
