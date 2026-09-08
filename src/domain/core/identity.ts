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
export type AssetId = UUID;
export type TrackId = UUID;
export type ClipId = UUID;
export type AnimationId = UUID;
/** Identity of the *source* an asset was derived from. Not the asset itself. */
export type SourceId = UUID;

/**
 * Shape of anything addressable in the canonical core.
 * Used by validation and by the duplicate-id invariant.
 */
export interface Identified {
  readonly id: UUID;
}

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** True when `value` is a syntactically valid UUID (any version, v1–v5). */
export function isUuid(value: unknown): value is UUID {
  return typeof value === 'string' && UUID_V4_PATTERN.test(value);
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

export function assertUsableId(value: unknown, field: string): UUID {
  if (!isUsableId(value)) {
    throw new Error(`DOMAIN_EMPTY_ID: ${field} — identifier must be a non-empty string`);
  }
  return value;
}

/**
 * Returns the first duplicate id in `items`, or `null` when every id is unique.
 * Deterministic: preserves input order and never relies on set iteration order.
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
