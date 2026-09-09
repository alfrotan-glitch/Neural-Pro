/**
 * Rate limiting — contracts/api.md §5, contracts/ai-integration.md §7.
 *
 * Fixed-window counters, applied **per IP and per token**. The clock is injected
 * so tests never sleep on wall-clock time (WP-01 §13).
 */
import type { Request, Response, NextFunction } from 'express';
import { appError } from '../errors';
import { extractBearerToken } from '../auth/session';
import type { SessionClaims } from '../auth/session';

export interface RateLimitRule {
  readonly perIpPerMinute: number;
  readonly perTokenPerMinute: number;
}

export interface RateLimiter {
  /** Returns the retry-after seconds when the call is refused, else null. */
  consume(key: string, limit: number, nowMs: number): { allowed: boolean; retryAfterSeconds: number };
  reset(): void;
}

const WINDOW_MS = 60_000;

export function createRateLimiter(): RateLimiter {
  const buckets = new Map<string, { windowStartedAt: number; count: number }>();

  return {
    consume(key, limit, nowMs) {
      const bucket = buckets.get(key);
      if (!bucket || nowMs - bucket.windowStartedAt >= WINDOW_MS) {
        buckets.set(key, { windowStartedAt: nowMs, count: 1 });
        return { allowed: true, retryAfterSeconds: 0 };
      }
      bucket.count += 1;
      if (bucket.count > limit) {
        const elapsed = nowMs - bucket.windowStartedAt;
        return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((WINDOW_MS - elapsed) / 1000)) };
      }
      return { allowed: true, retryAfterSeconds: 0 };
    },
    reset() {
      buckets.clear();
    },
  };
}

export interface RateLimitMiddlewareOptions {
  readonly limiter: RateLimiter;
  readonly rule: RateLimitRule;
  readonly operation: string;
  readonly now?: () => number;
  readonly clientIp?: (req: Request) => string;
}

function defaultClientIp(req: Request): string {
  return req.ip || req.socket.remoteAddress || 'unknown';
}

/**
 * Enforces both buckets. Either bucket exhausting produces
 * `429 RATE_LIMITED` with a `Retry-After` header and a typed error body.
 */
export function rateLimit(options: RateLimitMiddlewareOptions) {
  const now = options.now ?? Date.now;
  const clientIp = options.clientIp ?? defaultClientIp;

  return (req: Request, _res: Response, next: NextFunction): void => {
    const nowMs = now();
    const ip = clientIp(req);
    const session = (req as Request & { session?: SessionClaims }).session;
    const tokenId = session?.sid ?? extractBearerToken(req).slice(0, 16);

    const ipResult = options.limiter.consume(`${options.operation}:ip:${ip}`, options.rule.perIpPerMinute, nowMs);
    if (!ipResult.allowed) {
      next(
        Object.assign(
          appError({
            code: 'RATE_LIMITED',
            message: 'Too many requests from this network. Please retry shortly.',
            context: { operation: options.operation, scope: 'ip' },
          }),
          { retryAfterSeconds: ipResult.retryAfterSeconds },
        ),
      );
      return;
    }

    if (tokenId) {
      const tokenResult = options.limiter.consume(
        `${options.operation}:token:${tokenId}`,
        options.rule.perTokenPerMinute,
        nowMs,
      );
      if (!tokenResult.allowed) {
        next(
          Object.assign(
            appError({
              code: 'RATE_LIMITED',
              message: 'This session has exceeded its request budget. Please retry shortly.',
              context: { operation: options.operation, scope: 'token' },
            }),
            { retryAfterSeconds: tokenResult.retryAfterSeconds },
          ),
        );
        return;
      }
    }

    next();
  };
}

/**
 * Per-token concurrency guard (contracts/ai-integration.md §7: 2 concurrent
 * upstream calls per token). Implemented as a counting semaphore so a stalled
 * request cannot let a session fan out unbounded upstream work.
 */
export class ConcurrencyGuard {
  private readonly active = new Map<string, number>();

  constructor(private readonly limit: number) {}

  tryAcquire(key: string): boolean {
    const current = this.active.get(key) ?? 0;
    if (current >= this.limit) return false;
    this.active.set(key, current + 1);
    return true;
  }

  release(key: string): void {
    const current = this.active.get(key) ?? 0;
    if (current <= 1) this.active.delete(key);
    else this.active.set(key, current - 1);
  }

  activeCount(key: string): number {
    return this.active.get(key) ?? 0;
  }
}
