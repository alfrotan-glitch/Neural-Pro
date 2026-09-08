/**
 * Canonical domain error.
 *
 * Every invariant violation in `src/domain/**` throws this type so callers can
 * distinguish a domain rule violation from an unexpected runtime exception
 * without string matching.
 *
 * PURE: no platform APIs, no formatting dependencies, deterministic `code`.
 */
export type DomainInvariantCode =
  | 'DOMAIN_NOT_FINITE'
  | 'DOMAIN_NOT_A_NUMBER'
  | 'DOMAIN_NOT_AN_OBJECT'
  | 'DOMAIN_NEGATIVE'
  | 'DOMAIN_NOT_POSITIVE'
  | 'DOMAIN_OUT_OF_RANGE'
  | 'DOMAIN_EMPTY_ID'
  | 'DOMAIN_INVALID_INTERVAL'
  | 'DOMAIN_INVALID_FPS'
  | 'DOMAIN_INVALID_SIZE'
  | 'DOMAIN_INVALID_TRANSFORM'
  | 'DOMAIN_DUPLICATE_ID';

export class DomainInvariantError extends Error {
  public readonly code: DomainInvariantCode;
  public readonly field: string;

  constructor(code: DomainInvariantCode, field: string, detail: string) {
    super(`${code}: ${field} — ${detail}`);
    this.name = 'DomainInvariantError';
    this.code = code;
    this.field = field;
  }
}

export function isDomainInvariantError(value: unknown): value is DomainInvariantError {
  return value instanceof DomainInvariantError;
}
