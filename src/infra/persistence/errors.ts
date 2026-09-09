/**
 * Typed persistence errors (WP-05 / docs/contracts/persistence.md §8).
 *
 * Every failure the user can act on gets a stable machine-readable `code` so the
 * UI never has to string-match, and so a test can assert the exact failure mode
 * instead of "it threw something".
 */

export type PersistenceErrorCode =
  /** Document bytes could not be parsed or failed the integrity check. */
  | 'PERSISTENCE_CORRUPT'
  /** `schemaVersion` is not one this build knows how to read (R4 — never guessed). */
  | 'PERSISTENCE_UNSUPPORTED_VERSION'
  /** Storage quota exhausted. */
  | 'PERSISTENCE_QUOTA'
  /** A transient/local URL reached the serialisation gate (R1). */
  | 'PERSISTENCE_TRANSIENT_REFERENCE'
  /** The write itself failed for a non-quota reason. */
  | 'PERSISTENCE_FAILED'
  /** Another writer committed first; the caller must reload and retry. */
  | 'PERSISTENCE_CONFLICT'
  /** A referenced asset has no bytes. */
  | 'ASSET_MISSING'
  /** IndexedDB (or another required capability) is absent in this runtime. */
  | 'DEPENDENCY_UNAVAILABLE'
  /** A portable bundle could not be read. */
  | 'BUNDLE_CORRUPT';

export interface PersistenceErrorDetails {
  readonly projectId?: string;
  readonly assetId?: string;
  readonly clipId?: string;
  readonly key?: string;
  readonly foundVersion?: unknown;
  readonly supportedVersions?: readonly number[];
  readonly references?: readonly string[];
  readonly usage?: number | null;
  readonly expectedRevision?: number;
  readonly foundRevision?: number;
  readonly quota?: number | null;
  readonly cause?: unknown;
}

export class PersistenceError extends Error {
  readonly code: PersistenceErrorCode;
  readonly details: PersistenceErrorDetails;

  constructor(code: PersistenceErrorCode, message: string, details: PersistenceErrorDetails = {}) {
    super(message);
    this.name = 'PersistenceError';
    this.code = code;
    this.details = details;
    // Restore prototype chain for ES2015+ transpile targets (instanceof reliability).
    Object.setPrototypeOf(this, PersistenceError.prototype);
  }
}

export function isPersistenceError(value: unknown): value is PersistenceError {
  return value instanceof PersistenceError;
}

export function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { name?: unknown; message?: unknown };
  if (candidate.name === 'QuotaExceededError' || candidate.name === 'EncodingError') return true;
  if (typeof candidate.message === 'string') {
    const message = candidate.message.toLowerCase();
    if (message.includes('quota')) return true;
    if (message.includes('storage full')) return true;
  }
  return false;
}

export function asPersistenceError(error: unknown, fallbackMessage: string): PersistenceError {
  if (isPersistenceError(error)) return error;
  if (isQuotaError(error)) {
    return new PersistenceError('PERSISTENCE_QUOTA', 'Storage quota exceeded while writing the project.', {
      cause: error,
    });
  }
  return new PersistenceError('PERSISTENCE_FAILED', `${fallbackMessage}: ${describeError(error)}`, {
    cause: error,
  });
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}
