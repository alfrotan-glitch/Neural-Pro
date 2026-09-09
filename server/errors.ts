/**
 * Server error model — implements `docs/contracts/errors.md`.
 *
 * Every response is either a typed success or a typed error. No endpoint may
 * return 200 with substitute content (INV-010 / ADR-009).
 */
import type { ErrorCode } from '../src/domain/errors/appError';

export type { ErrorCode };

export interface AppError {
  readonly code: ErrorCode;
  /** SAFE for end users — no internals, no paths, no keys. */
  readonly message: string;
  readonly retryable: boolean;
  /** Developer diagnostics; logged server-side, never sent to the client by default. */
  readonly detail?: string;
  readonly cause?: unknown;
  readonly context?: Readonly<Record<string, string | number>>;
}

const HTTP_STATUS: Readonly<Record<ErrorCode, number>> = {
  VALIDATION_FAILED: 400,
  SCHEMA_MISMATCH: 400,
  OUT_OF_RANGE: 400,
  EMPTY_INPUT: 400,
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  OPERATION_NOT_ALLOWED: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  AI_RATE_LIMITED: 429,
  QUOTA_EXCEEDED: 429,
  RESOURCE_EXHAUSTED: 429,
  AI_SAFETY_BLOCKED: 422,
  AI_NOT_CONFIGURED: 503,
  AI_UPSTREAM_ERROR: 502,
  AI_RESPONSE_INVALID: 502,
  AI_TIMEOUT: 504,
  TIMEOUT: 504,
  CANCELLED: 499,
  EXPIRED: 504,
  MEDIA_PREPARE_FAILED: 500,
  MEDIA_DECODE_FAILED: 500,
  MEDIA_LOAD_FAILED: 500,
  MEDIA_CORS_FAILED: 500,
  RENDER_FAILED: 500,
  ENCODE_FAILED: 500,
  MUX_FAILED: 500,
  PERSISTENCE_FAILED: 500,
  PERSISTENCE_QUOTA: 500,
  PERSISTENCE_CORRUPT: 500,
  ASSET_MISSING: 404,
  DEPENDENCY_UNAVAILABLE: 503,
  INTERNAL: 500,
  NOT_IMPLEMENTED: 501,
};

/** Only these codes may ever be retried (contract §4 — allowlist, not denylist). */
const RETRYABLE: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'RATE_LIMITED',
  'AI_RATE_LIMITED',
  'AI_TIMEOUT',
  'TIMEOUT',
  'DEPENDENCY_UNAVAILABLE',
]);

export function httpStatusFor(code: ErrorCode): number {
  return HTTP_STATUS[code] ?? 500;
}

export function isRetryableCode(code: ErrorCode): boolean {
  return RETRYABLE.has(code);
}

export function appError(input: {
  code: ErrorCode;
  message: string;
  retryable?: boolean;
  detail?: string;
  cause?: unknown;
  context?: Record<string, string | number>;
}): AppError {
  return {
    code: input.code,
    message: input.message,
    retryable: input.retryable ?? isRetryableCode(input.code),
    detail: input.detail,
    cause: input.cause,
    context: input.context,
  };
}

/** Normalises an unknown throw into a typed AppError (contract §7). */
export function toAppError(value: unknown, fallbackMessage = 'The request could not be completed.'): AppError {
  if (isAppError(value)) return value;
  const message = value instanceof Error ? value.message : String(value ?? '');
  return appError({
    code: 'INTERNAL',
    message: fallbackMessage,
    detail: message.slice(0, 500),
    cause: value,
  });
}

export function isAppError(value: unknown): value is AppError {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { code?: unknown }).code === 'string' &&
    typeof (value as { message?: unknown }).message === 'string' &&
    typeof (value as { retryable?: unknown }).retryable === 'boolean'
  );
}

/** Strips anything that must never reach a client or a log line. */
export function safeDetail(detail: string | undefined): string | undefined {
  if (!detail) return undefined;
  return detail.replace(/\s+/g, ' ').slice(0, 300);
}
