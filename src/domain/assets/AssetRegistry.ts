/**
 * AssetRegistry — the only authority for asset bytes and object URLs.
 *
 * Normative source: docs/contracts/media-assets.md §3 (INV-008, INV-009).
 *
 * Implementations:
 *   - `src/infra/persistence/IndexedDbAssetRegistry.ts` — durable (production)
 *   - `src/infra/persistence/MemoryAssetRegistry.ts`    — session-scoped, used for
 *     tests and for the explicitly degraded mode when IndexedDB is unavailable.
 *
 * Object-URL rules (INV-008) are enforced by the implementations:
 *   1. `resolveUrl` is the ONLY place that mints an object URL.
 *   2. every minted URL is recorded in `Map<AssetId, Set<string>>`;
 *   3. `releaseUrl` revokes and untracks;
 *   4. `releaseAll` revokes everything on project close / unload.
 */

import type { AssetId, AssetRecord, MediaProbe, NewAssetMeta } from './types';

export interface AssetRegistry {
  /** Stores bytes + record. Dedupes on `contentHash` when one is available. */
  put(blob: Blob, meta: NewAssetMeta): Promise<AssetId>;

  /** Raw bytes, or `null` when the asset is unknown/evicted. */
  get(id: AssetId): Promise<Blob | null>;

  /** Manifest record, or `null`. */
  getRecord(id: AssetId): Promise<AssetRecord | null>;

  /**
   * Mints (or reuses) an object URL for the asset's bytes and TRACKS it.
   * Remote-only assets return their `href` and mint nothing.
   * Throws `ASSET_MISSING` when the bytes are unavailable.
   */
  resolveUrl(id: AssetId): Promise<string>;

  /** Revokes + untracks a previously minted URL. Idempotent. */
  releaseUrl(id: AssetId, url: string): void;

  /** Revokes every tracked URL. Returns how many were revoked. */
  releaseAll(): number;

  /** Number of currently tracked (live) object URLs. Test seam for INV-008. */
  trackedUrlCount(): number;

  /** Measured metadata for a stored asset (cached on the record). */
  measure(id: AssetId): Promise<MediaProbe>;

  /** Measures bytes before they are persisted. */
  probeFrom(blob: Blob, mimeType: string): Promise<MediaProbe>;

  list(): Promise<readonly AssetRecord[]>;

  /** Soft delete: bytes are reclaimed later by `collectGarbage`. */
  delete(id: AssetId): Promise<void>;

  /** Assets no longer referenced by any project document. */
  orphaned(): Promise<readonly AssetId[]>;
}

export type StorageAvailability =
  | { readonly available: true; readonly kind: 'indexeddb' }
  | { readonly available: false; readonly kind: 'memory'; readonly reason: string };

export interface StorageEstimate {
  readonly usage: number | null;
  readonly quota: number | null;
  readonly persisted: boolean | null;
}

/** Registry-level capabilities surfaced to the UI so degradation is never silent. */
export interface AssetRegistryInfo {
  readonly availability: StorageAvailability;
  estimate(): Promise<StorageEstimate>;
}

export const ASSET_URL_KIND = {
  objectUrl: 'object-url',
  remote: 'remote',
} as const;
