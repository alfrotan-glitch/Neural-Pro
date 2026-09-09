/**
 * Canonical error codes — single source of truth for the string union defined in
 * `docs/contracts/errors.md`. Imported by both the browser workflow runtime and
 * the server boundary so the two sides cannot drift.
 *
 * This module is pure: no I/O, no React, no infra imports.
 */
export type ErrorCode =
  // validation
  | 'VALIDATION_FAILED' | 'SCHEMA_MISMATCH' | 'OUT_OF_RANGE' | 'EMPTY_INPUT'
  // auth
  | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'OPERATION_NOT_ALLOWED'
  // limits
  | 'RATE_LIMITED' | 'QUOTA_EXCEEDED' | 'PAYLOAD_TOO_LARGE' | 'RESOURCE_EXHAUSTED'
  // lifecycle
  | 'TIMEOUT' | 'CANCELLED' | 'EXPIRED' | 'NOT_FOUND' | 'CONFLICT'
  // dependencies
  | 'AI_NOT_CONFIGURED' | 'AI_UPSTREAM_ERROR' | 'AI_TIMEOUT' | 'AI_RATE_LIMITED'
  | 'AI_RESPONSE_INVALID' | 'AI_SAFETY_BLOCKED'
  | 'MEDIA_PREPARE_FAILED' | 'MEDIA_DECODE_FAILED' | 'MEDIA_LOAD_FAILED' | 'MEDIA_CORS_FAILED'
  | 'RENDER_FAILED' | 'ENCODE_FAILED' | 'MUX_FAILED'
  | 'PERSISTENCE_FAILED' | 'PERSISTENCE_QUOTA' | 'PERSISTENCE_CORRUPT' | 'ASSET_MISSING'
  | 'DEPENDENCY_UNAVAILABLE'
  // internal
  | 'INTERNAL' | 'NOT_IMPLEMENTED';

export interface AppError {
  readonly code: ErrorCode;
  /** SAFE for end users — no internals, no paths, no keys. */
  readonly message: string;
  readonly detail?: string;
  readonly retryable: boolean;
  readonly cause?: unknown;
  readonly context?: Readonly<Record<string, string | number>>;
}

/** Retry is allowlisted, never denylisted (contracts/errors.md §4). */
export const RETRYABLE_ERROR_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  'RATE_LIMITED',
  'AI_RATE_LIMITED',
  'AI_TIMEOUT',
  'TIMEOUT',
  'DEPENDENCY_UNAVAILABLE',
]);

export function isRetryableCode(code: ErrorCode): boolean {
  return RETRYABLE_ERROR_CODES.has(code);
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

export function createAppError(input: {
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

/** Normalises any throw into a typed AppError; the original is kept as `cause`. */
export function toAppError(value: unknown, fallbackMessage = 'Something went wrong.'): AppError {
  if (isAppError(value)) return value;
  if (value instanceof DOMException && value.name === 'AbortError') {
    return createAppError({ code: 'CANCELLED', message: 'The operation was cancelled.', retryable: false, cause: value });
  }
  const detail = value instanceof Error ? value.message : String(value ?? '');
  return createAppError({
    code: 'INTERNAL',
    message: fallbackMessage,
    detail: detail.slice(0, 500),
    cause: value,
  });
}
