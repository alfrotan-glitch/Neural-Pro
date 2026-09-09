/**
 * Storage capability probing + lifecycle.
 *
 * Two responsibilities:
 *  1. Tell the truth about durability. `navigator.storage.persist()` asks the
 *     browser not to evict our data under storage pressure; if the request is
 *     refused the UI must say "this project is not protected from eviction"
 *     rather than showing a green "Saved".
 *  2. Reclaim space deliberately. Orphaned assets (no document references them)
 *     are deleted only after a grace window, so an undo or a crashed session can
 *     still restore them.
 */

import type { AssetId } from '../../domain/assets/types';
import type { AssetRegistry } from '../../domain/assets/AssetRegistry';
import type { AssetBlobStore } from './assetRegistryCore';
import { isIndexedDbAvailable } from './indexedDbBackend';
import type { StorageEstimate } from '../../domain/assets/AssetRegistry';

export const DEFAULT_ORPHAN_GRACE_MS = 7 * 24 * 60 * 60 * 1000;

interface NavigatorLike {
  storage?: {
    estimate?(): Promise<{ usage?: number; quota?: number }>;
    persist?(): Promise<boolean>;
    persisted?(): Promise<boolean>;
  };
}

export async function estimateStorage(): Promise<StorageEstimate> {
  const navigator = (globalThis as { navigator?: NavigatorLike }).navigator;
  const storage = navigator?.storage;
  if (!storage?.estimate) return { usage: null, quota: null, persisted: null };
  try {
    const estimate = await storage.estimate();
    const persisted = storage.persisted ? await storage.persisted() : null;
    return {
      usage: typeof estimate.usage === 'number' ? estimate.usage : null,
      quota: typeof estimate.quota === 'number' ? estimate.quota : null,
      persisted,
    };
  } catch {
    return { usage: null, quota: null, persisted: null };
  }
}

/**
 * Asks the browser to keep our data across eviction. Returns `true` only when
 * persistence is actually granted; `null` when the runtime cannot answer.
 */
export async function requestPersistentStorage(): Promise<boolean | null> {
  const navigator = (globalThis as { navigator?: NavigatorLike }).navigator;
  const storage = navigator?.storage;
  if (!storage?.persist) return null;
  try {
    return await storage.persist();
  } catch {
    return null;
  }
}

export type PersistenceStorageMode = 'durable' | 'session';

export interface StorageCapabilityReport {
  readonly mode: PersistenceStorageMode;
  readonly indexedDbAvailable: boolean;
  readonly persistentStorageGranted: boolean | null;
  readonly estimate: StorageEstimate;
  readonly reason: string | null;
}

/** Single probe the UI can render as an honest durability indicator. */
export async function describeStorageCapability(): Promise<StorageCapabilityReport> {
  const indexedDbAvailable = isIndexedDbAvailable();
  if (!indexedDbAvailable) {
    return {
      mode: 'session',
      indexedDbAvailable: false,
      persistentStorageGranted: null,
      estimate: { usage: null, quota: null, persisted: null },
      reason: 'IndexedDB is unavailable in this browsing context; the project survives this session only.',
    };
  }

  const [granted, estimate] = await Promise.all([requestPersistentStorage(), estimateStorage()]);
  return {
    mode: granted === false ? 'session' : 'durable',
    indexedDbAvailable: true,
    persistentStorageGranted: granted,
    estimate,
    reason:
      granted === false
        ? 'The browser refused persistent storage; the project may be evicted under storage pressure.'
        : null,
  };
}

export interface GarbageCollectionResult {
  readonly removed: AssetId[];
  readonly keptForGrace: AssetId[];
  readonly removedBytes: number;
}

/**
 * Deletes assets no document references, but only once they are past the grace
 * window. Called after a successful save and on explicit user action.
 */
export async function collectOrphanedAssets(options: {
  registry: AssetRegistry;
  referenced: ReadonlySet<AssetId>;
  now?: number;
  graceMs?: number;
  force?: boolean;
}): Promise<GarbageCollectionResult> {
  const now = options.now ?? Date.now();
  const graceMs = options.graceMs ?? DEFAULT_ORPHAN_GRACE_MS;
  const records = await options.registry.list();
  const removed: AssetId[] = [];
  const keptForGrace: AssetId[] = [];
  let removedBytes = 0;

  for (const record of records) {
    if (options.referenced.has(record.id)) continue;
    const age = now - (record.deletedAt ?? record.createdAt);
    if (!options.force && age < graceMs) {
      keptForGrace.push(record.id);
      continue;
    }
    const existing = await options.registry.getRecord(record.id);
    removedBytes += existing?.byteSize ?? record.byteSize;
    await options.registry.delete(record.id);
    removed.push(record.id);
  }

  return { removed, keptForGrace, removedBytes };
}

/**
 * Hard-deletes bytes for assets already soft-deleted (final reclamation).
 * Reads the raw record list because `registry.list()` intentionally hides
 * soft-deleted entries.
 */
export async function purgeDeletedAssets(options: {
  store: AssetBlobStore;
  now?: number;
  graceMs?: number;
}): Promise<{ purged: AssetId[]; freedBytes: number }> {
  const now = options.now ?? Date.now();
  const graceMs = options.graceMs ?? DEFAULT_ORPHAN_GRACE_MS;
  const records = await options.store.listRecords();
  const purged: AssetId[] = [];
  let freedBytes = 0;

  for (const record of records) {
    if (record.deletedAt === null) continue;
    if (now - record.deletedAt < graceMs) continue;
    freedBytes += record.byteSize;
    await options.store.remove(record.id);
    await options.store.removeRecord(record.id);
    purged.push(record.id);
  }

  return { purged, freedBytes };
}
