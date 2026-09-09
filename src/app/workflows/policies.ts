/**
 * Retry / timeout policies (contracts/workflows.md §4–§5).
 * Retry is bounded, backed off, jittered and counted. There is no unbounded
 * `while (…)` retry loop anywhere in the application.
 */
import { isRetryableCode } from '../../domain/errors/appError';
import type { AppError, ErrorCode } from '../../domain/errors/appError';
import type { RecoveryPolicy, RetryPolicy, TimeoutPolicy } from './types';

export const AI_RETRY_CODES: readonly ErrorCode[] = [
  'RATE_LIMITED',
  'AI_RATE_LIMITED',
  'AI_TIMEOUT',
  'TIMEOUT',
  'DEPENDENCY_UNAVAILABLE',
];

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  backoff: 'exponential',
  baseDelayMs: 500,
  maxDelayMs: 8_000,
  jitter: true,
  retryOn: AI_RETRY_CODES,
};

export const NO_RETRY_POLICY: RetryPolicy = { ...DEFAULT_RETRY_POLICY, maxAttempts: 1, retryOn: [] };

/** contracts/workflows.md §5 defaults. */
export const TIMEOUT_POLICIES: Readonly<Record<string, TimeoutPolicy>> = {
  export: { runTimeoutMs: 30 * 60 * 1000, graceMs: 10_000 },
  podcast: { runTimeoutMs: 10 * 60 * 1000, stepTimeoutMs: 130_000, graceMs: 10_000 },
  tts: { runTimeoutMs: 10 * 60 * 1000, stepTimeoutMs: 190_000, graceMs: 10_000 },
  captions: { runTimeoutMs: 2 * 60 * 1000, stepTimeoutMs: 70_000, graceMs: 5_000 },
  recovery: { runTimeoutMs: 2 * 60 * 1000, graceMs: 5_000 },
};

export const DEFAULT_RECOVERY_POLICY: RecoveryPolicy = {
  strategy: 'resume-from-checkpoint',
  retainCheckpointsMs: 24 * 60 * 60 * 1000,
  maxResumeAgeMs: 60 * 60 * 1000,
};

export function shouldRetry(policy: RetryPolicy, error: AppError, attemptsUsed: number): boolean {
  if (attemptsUsed >= policy.maxAttempts) return false;
  if (!policy.retryOn.includes(error.code)) return false;
  return isRetryableCode(error.code);
}

/** Deterministic given `rng`; `rng` is injected so tests never depend on Math.random. */
export function backoffDelayMs(policy: RetryPolicy, attemptsUsed: number, rng: () => number = Math.random): number {
  if (policy.backoff === 'none' || attemptsUsed <= 0) return 0;
  const exponential = policy.baseDelayMs * 2 ** (attemptsUsed - 1);
  const capped = Math.min(policy.maxDelayMs, policy.backoff === 'fixed' ? policy.baseDelayMs : exponential);
  if (!policy.jitter) return capped;
  // Full jitter: uniform in [capped/2, capped].
  return Math.round(capped / 2 + rng() * (capped / 2));
}

export function clampProgress(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}
