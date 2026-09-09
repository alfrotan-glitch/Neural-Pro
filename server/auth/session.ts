/**
 * Session tokens — ADR-014.
 *
 * Short-lived, HMAC-signed, scope-bearing tokens issued by `GET /api/session`.
 * Protected routes require `Authorization: Bearer <token>` in **every**
 * environment: authorisation is never gated on `NODE_ENV` (D-003).
 */
import crypto from 'crypto';
import type { Request, Response, NextFunction } from 'express';
import { appError } from '../errors';
import type { AppError } from '../errors';

export type SessionScope = 'ai:script' | 'ai:speech' | 'captions';

export const ALL_SCOPES: readonly SessionScope[] = ['ai:script', 'ai:speech', 'captions'];

export interface SessionClaims {
  readonly sid: string;
  readonly iat: number;
  readonly exp: number;
  readonly scopes: readonly SessionScope[];
}

export interface SessionIssuer {
  issue(scopes?: readonly SessionScope[], nowMs?: number): { token: string; claims: SessionClaims };
  verify(token: string, nowMs?: number): { ok: true; claims: SessionClaims } | { ok: false; error: AppError };
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function timingSafeEqualStrings(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

export function createSessionIssuer(options: {
  secret: Buffer;
  ttlMs: number;
  now?: () => number;
  randomBytes?: (size: number) => Buffer;
}): SessionIssuer {
  const now = options.now ?? Date.now;
  const randomBytes = options.randomBytes ?? ((size: number) => crypto.randomBytes(size));

  const sign = (payload: string): string =>
    crypto.createHmac('sha256', options.secret).update(payload).digest('base64url');

  return {
    issue(scopes = ALL_SCOPES, nowMs = now()) {
      const claims: SessionClaims = {
        sid: randomBytes(12).toString('base64url'),
        iat: Math.floor(nowMs / 1000),
        exp: Math.floor((nowMs + options.ttlMs) / 1000),
        scopes: [...new Set(scopes)],
      };
      const payload = base64url(JSON.stringify(claims));
      return { token: `${payload}.${sign(payload)}`, claims };
    },

    verify(token, nowMs = now()) {
      if (typeof token !== 'string' || token.length === 0 || token.length > 4_096) {
        return { ok: false as const, error: appError({ code: 'UNAUTHENTICATED', message: 'A valid session is required.' }) };
      }
      const separator = token.lastIndexOf('.');
      if (separator <= 0) {
        return { ok: false as const, error: appError({ code: 'UNAUTHENTICATED', message: 'A valid session is required.' }) };
      }
      const payload = token.slice(0, separator);
      const signature = token.slice(separator + 1);
      if (!timingSafeEqualStrings(signature, sign(payload))) {
        return { ok: false as const, error: appError({ code: 'UNAUTHENTICATED', message: 'The session token is not valid.' }) };
      }

      let claims: SessionClaims;
      try {
        claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionClaims;
      } catch {
        return { ok: false as const, error: appError({ code: 'UNAUTHENTICATED', message: 'The session token is not valid.' }) };
      }

      if (typeof claims?.exp !== 'number' || Math.floor(nowMs / 1000) >= claims.exp) {
        return { ok: false as const, error: appError({ code: 'UNAUTHENTICATED', message: 'The session has expired. Reload to continue.' }) };
      }
      if (!Array.isArray(claims.scopes)) {
        return { ok: false as const, error: appError({ code: 'UNAUTHENTICATED', message: 'The session token is not valid.' }) };
      }
      return { ok: true as const, claims };
    },
  };
}

export function extractBearerToken(req: Request): string {
  const header = req.header('authorization');
  if (!header) return '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() ?? '';
}

export interface AuthenticatedRequest extends Request {
  session?: SessionClaims;
}

/** Middleware factory: requires a valid token carrying `scope`. */
export function requireSession(issuer: SessionIssuer, scope: SessionScope) {
  return (req: AuthenticatedRequest, _res: Response, next: NextFunction): void => {
    const token = extractBearerToken(req);
    const result = issuer.verify(token);
    if (!result.ok) {
      next(result.error);
      return;
    }
    if (!result.claims.scopes.includes(scope)) {
      next(appError({ code: 'FORBIDDEN', message: 'This session is not allowed to perform that operation.' }));
      return;
    }
    req.session = result.claims;
    next();
  };
}
