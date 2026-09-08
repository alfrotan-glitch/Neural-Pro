import { DomainInvariantError } from './errors';

/**
 * Canonical identity kernel.
 *
 * ONE definition of every entity identifier in Neural-Pro.
 *
 * Design decision (ADR-017): identifiers are **plain string aliases**, not
 * nominal brands. Rationale:
 *  - the entire executing codebase addresses entities by `string`
 *    (`ClipNode.id`, `Track.id`, `ProjectState.projectId`, `sourceId`);
 *  - a nominal brand would require touching every call site before the core
 *    could be adopted, which is a migration, not a kernel;
 *  - strength comes from **one definition + boundary validation**, not from a
 *    compile-time phantom property that can be cast away.
 *
 * Adoption rule: `src/domain/**` and every feature module import these aliases
 * instead of redeclaring `type UUID = string` in a second file.
 */

/** Canonical opaque entity identifier. Wire-compatible with today's `string`. */
export type UUID = string;

export type ProjectId = UUID;
/**
 * Forward declaration for the asset registry seam (WP-05).
 * The kernel does not use it yet; `src/domain/assets/**` must import it from
 * here rather than redeclare it. Owner: WP-05. Delete if WP-05 does not adopt it.
 */
export type AssetId = UUID;
export type TrackId = UUID;
export type ClipId = UUID;
/** Identity of the *source* an asset was derived from. Not the asset itself. */
export type SourceId = UUID;

/**
 * Shape of anything addressable in the canonical core.
 * Used by validation and by the duplicate-id invariant.
 */
export interface Identified {
  readonly id: UUID;
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True when `value` is a syntactically valid UUID (any version, v1–v5). */
export function isUuid(value: unknown): value is UUID {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * True when `value` can address an entity at all: a non-empty, non-blank string.
 *
 * This is the *permissive* rule and matches executing behaviour: the live
 * codebase happily uses readable ids such as `track_text_captions` and `t1`.
 * `isUuid` is the *strict* rule for generated ids only.
 */
export function isUsableId(value: unknown): value is UUID {
  return typeof value === 'string' && value.trim().length > 0;
}

export function assertUsableId(value: unknown, field = 'id'): UUID {
  if (!isUsableId(value)) {
    throw new DomainInvariantError(
      'DOMAIN_EMPTY_ID',
      field,
      'identifier must be a non-empty string',
    );
  }
  return value;
}

/**
 * Returns the id of the first element that repeats an id already seen — i.e. the
 * second occurrence of the first repeated id — or `null` when every id is unique.
 *
 * Deterministic: single pass in input order, never set iteration order.
 * Example: `[b, a, a, b]` ⇒ `'a'` (the first repeat encountered while scanning).
 */
export function findDuplicateId(items: readonly Identified[]): UUID | null {
  const seen = new Set<UUID>();
  for (const item of items) {
    if (typeof item?.id !== 'string') continue;
    if (seen.has(item.id)) return item.id;
    seen.add(item.id);
  }
  return null;
}

/**
 * Throws when `items` contains the same id twice.
 *
 * This is the executable form of the contract invariant "no two clips with the
 * same id" (`docs/contracts/project-state.md` §6), which today is enforced only
 * inside `timelineInvariants.validateClip`.
 */
export function assertNoDuplicateIds(items: readonly Identified[], field = 'items'): void {
  const duplicate = findDuplicateId(items);
  if (duplicate !== null) {
    throw new DomainInvariantError('DOMAIN_DUPLICATE_ID', field, `duplicate identifier: ${duplicate}`);
  }
}