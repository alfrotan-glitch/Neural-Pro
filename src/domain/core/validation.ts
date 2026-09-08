import { DomainInvariantError, type DomainInvariantCode } from './errors';
/**
 * Atomic domain predicates.
 *
 * These are the *leaves* of validation: single-value, total, and throwing.
 * They exist so that no module has to re-implement "is this a finite,
 * non-negative number" — which is currently re-implemented in
 * `timelineInvariants.ts`, `projectStateInvariants.ts`,
 * `timelineGeometry.ts`, `mediaFrameGeometry.ts`, `clipBounds.ts` and
 * `intervals.ts`.
 *
 * Aggregate rules (clip/track/project structure) intentionally stay in
 * `features/video-studio/project/validation/**` until WP-08 relocates them;
 * when it does, they compose these predicates instead of redefining them.
 */

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function fail(code: DomainInvariantCode, field: string, detail: string): never {
  throw new DomainInvariantError(code, field, detail);
}

export function assertFinite(value: unknown, field = 'value'): number {
  if (!isFiniteNumber(value)) {
    return fail('DOMAIN_NOT_FINITE', field, `must be a finite number (received ${String(value)})`);
  }
  return value;
}

export function assertNonNegative(value: unknown, field = 'value'): number {
  const numeric = assertFinite(value, field);
  if (numeric < 0) {
    return fail('DOMAIN_NEGATIVE', field, `must be >= 0 (received ${numeric})`);
  }
  return numeric;
}

export function assertPositive(value: unknown, field = 'value'): number {
  const numeric = assertFinite(value, field);
  if (numeric <= 0) {
    return fail('DOMAIN_NOT_POSITIVE', field, `must be > 0 (received ${numeric})`);
  }
  return numeric;
}

export function assertInRange(
  value: unknown,
  min: number,
  max: number,
  field = 'value',
): number {
  const numeric = assertFinite(value, field);
  if (numeric < min || numeric > max) {
    return fail('DOMAIN_OUT_OF_RANGE', field, `must be within [${min}, ${max}] (received ${numeric})`);
  }
  return numeric;
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function assertPlainObject(value: unknown, field = 'value'): Record<string, unknown> {
  if (!isPlainObject(value)) {
    return fail('DOMAIN_NOT_AN_OBJECT', field, 'must be a plain object');
  }
  return value;
}
