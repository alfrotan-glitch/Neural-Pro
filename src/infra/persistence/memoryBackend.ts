/**
 * In-memory backends.
 *
 * Two jobs:
 *  1. Tests. IndexedDB does not exist in Node, so the whole save/reload/recover
 *     contract is exercised against this backend — with a `crashBeforeCommit`
 *     hook that makes an interrupted write observable instead of hypothetical.
 *  2. Degraded mode. When IndexedDB is unavailable (private browsing, a
 *     partitioned frame) the app falls back to this backend and says so loudly:
 *     data survives the session, NOT the reload.
 */

import type { AssetId, AssetRecord } from '../../domain/assets/types';
import { createAssetRegistry, type AssetBlobStore, type ManagedAssetRegistry } from './assetRegistryCore';
import { createObjectUrlTracker, type ObjectUrlTracker } from './objectUrlTracker';
import type { KeyValueBackend, TransactionContext } from './indexedDbBackend';

export interface MemoryBackendHooks {
  /** Runs after staging, before the staged writes become visible. Throw to simulate a crash. */
  crashBeforeCommit?: (staged: ReadonlyMap<string, string | null>) => void;
  /** Counts commits so a test can assert "exactly one atomic write". */
  onCommit?: (staged: ReadonlyMap<string, string | null>) => void;
  /** Turns the next `put`/commit into a quota failure. */
  failNextWriteWith?: unknown;
}

export function createMemoryKeyValueBackend(hooks: MemoryBackendHooks = {}): KeyValueBackend {
  const data = new Map<string, string>();
  let armedFailure: unknown = hooks.failNextWriteWith ?? null;

  const applyStaged = (staged: ReadonlyMap<string, string | null>): void => {
    for (const [key, value] of staged) {
      if (value === null) data.delete(key);
      else data.set(key, value);
    }
    hooks.onCommit?.(staged);
  };

  return {
    kind: 'memory',

    async get(key) {
      return data.get(key) ?? null;
    },

    async put(key, value) {
      if (armedFailure) {
        const failure = armedFailure;
        armedFailure = null;
        throw failure;
      }
      data.set(key, value);
    },

    async delete(key) {
      data.delete(key);
    },

    async keys(prefix) {
      const keys = [...data.keys()];
      return prefix ? keys.filter((key) => key.startsWith(prefix)) : keys;
    },

    async transaction(mutate) {
      const staged = new Map<string, string | null>();
      const context: TransactionContext = {
        async get(key) {
          if (staged.has(key)) {
            return staged.get(key) ?? null;
          }
          return data.get(key) ?? null;
        },
        put(key, value) {
          staged.set(key, value);
        },
        delete(key) {
          staged.set(key, null);
        },
      };

      const result = await mutate(context);
      hooks.crashBeforeCommit?.(staged);
      if (armedFailure) {
        const failure = armedFailure;
        armedFailure = null;
        throw failure;
      }
      applyStaged(staged);
      return result;
    },

    close() {
      /* nothing to release */
    },
  };
}

export function createMemoryAssetStore(): AssetBlobStore {
  const blobs = new Map<AssetId, Blob>();
  const records = new Map<AssetId, AssetRecord>();

  return {
    kind: 'memory',
    async write(id, blob) {
      blobs.set(id, blob);
    },
    async read(id) {
      return blobs.get(id) ?? null;
    },
    async remove(id) {
      blobs.delete(id);
    },
    async writeRecord(record) {
      records.set(record.id, structuredClone(record));
    },
    async readRecord(id) {
      const record = records.get(id);
      return record ? structuredClone(record) : null;
    },
    async listRecords() {
      return [...records.values()].map((record) => structuredClone(record));
    },
    async removeRecord(id) {
      records.delete(id);
      blobs.delete(id);
    },
  };
}

export interface MemoryAssetRegistryOptions {
  readonly tracker?: ObjectUrlTracker;
  readonly uuid?: () => string;
  readonly clock?: () => number;
  readonly referenceProvider?: () => Promise<ReadonlySet<AssetId> | null> | ReadonlySet<AssetId> | null;
}

/** Session-scoped registry. Explicitly NOT durable — callers must surface that. */
export function createMemoryAssetRegistry(options: MemoryAssetRegistryOptions = {}): ManagedAssetRegistry {
  return createAssetRegistry({
    store: createMemoryAssetStore(),
    tracker: options.tracker ?? createObjectUrlTracker(),
    uuid: options.uuid,
    clock: options.clock,
    referenceProvider: options.referenceProvider,
  });
}
