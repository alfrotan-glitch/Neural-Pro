/**
 * Durable AssetRegistry (WP-05 output).
 *
 * Thin composition: IndexedDB byte/record store + the shared registry core.
 * All semantics (identity, dedupe, measurement, URL ownership) live in
 * `assetRegistryCore`, so this class cannot drift from the in-memory one.
 */

import { createAssetRegistry, type ManagedAssetRegistry } from './assetRegistryCore';
import {
  createIndexedDbAssetStore,
  openNeuralProDatabase,
  type IDBDatabaseLike,
} from './indexedDbBackend';
import { createObjectUrlTracker, type ObjectUrlTracker } from './objectUrlTracker';
import type { AssetId } from '../../domain/assets/types';

export interface IndexedDbAssetRegistryOptions {
  readonly database?: IDBDatabaseLike;
  readonly tracker?: ObjectUrlTracker;
  readonly referenceProvider?: () => Promise<ReadonlySet<AssetId> | null> | ReadonlySet<AssetId> | null;
  readonly uuid?: () => string;
  readonly clock?: () => number;
}

export async function createIndexedDbAssetRegistry(
  options: IndexedDbAssetRegistryOptions = {},
): Promise<ManagedAssetRegistry> {
  const db = options.database ?? (await openNeuralProDatabase());
  return createAssetRegistry({
    store: createIndexedDbAssetStore(db),
    tracker: options.tracker ?? createObjectUrlTracker(),
    referenceProvider: options.referenceProvider,
    uuid: options.uuid,
    clock: options.clock,
  });
}
