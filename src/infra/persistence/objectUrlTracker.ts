/**
 * Single mint/revoke authority for object URLs (INV-008).
 *
 * Nothing else in the app is allowed to call `URL.createObjectURL` for project
 * media. Every URL minted here is recorded against its `AssetId` so:
 *   - `releaseAll()` can revoke everything on project close / page unload,
 *   - a test can assert the mint/revoke balance is exactly zero per operation,
 *   - a leak shows up as a non-zero `stats().live` instead of as a heap profile.
 */

import type { AssetId } from '../../domain/assets/types';

export interface ObjectUrlEnvironment {
  createObjectURL(blob: Blob): string;
  revokeObjectURL(url: string): void;
}

export interface ObjectUrlTrackerStats {
  readonly minted: number;
  readonly revoked: number;
  readonly live: number;
}

export interface ObjectUrlTracker {
  mint(assetId: AssetId, blob: Blob): string;
  release(assetId: AssetId, url: string): boolean;
  releaseAll(): number;
  count(): number;
  trackedFor(assetId: AssetId): string[];
  stats(): ObjectUrlTrackerStats;
}

function defaultEnvironment(): ObjectUrlEnvironment {
  const globalUrl = (globalThis as { URL?: typeof URL }).URL;
  if (!globalUrl || typeof globalUrl.createObjectURL !== 'function') {
    throw new Error('URL.createObjectURL is unavailable in this runtime');
  }
  return {
    createObjectURL: (blob: Blob) => globalUrl.createObjectURL(blob),
    revokeObjectURL: (url: string) => globalUrl.revokeObjectURL(url),
  };
}

export function createObjectUrlTracker(environment?: ObjectUrlEnvironment): ObjectUrlTracker {
  const env = environment ?? defaultEnvironment();
  const tracked = new Map<AssetId, Set<string>>();
  let minted = 0;
  let revoked = 0;

  const revoke = (url: string): void => {
    try {
      env.revokeObjectURL(url);
    } catch {
      // Revoking an already-revoked URL throws in some engines; the entry is gone either way.
    }
    revoked += 1;
  };

  return {
    mint(assetId, blob) {
      const url = env.createObjectURL(blob);
      let set = tracked.get(assetId);
      if (!set) {
        set = new Set<string>();
        tracked.set(assetId, set);
      }
      set.add(url);
      minted += 1;
      return url;
    },
    release(assetId, url) {
      const set = tracked.get(assetId);
      if (!set || !set.has(url)) return false;
      set.delete(url);
      if (set.size === 0) tracked.delete(assetId);
      revoke(url);
      return true;
    },
    releaseAll() {
      let count = 0;
      for (const [assetId, set] of [...tracked.entries()]) {
        for (const url of [...set]) {
          revoke(url);
          count += 1;
        }
        tracked.delete(assetId);
      }
      return count;
    },
    count() {
      let count = 0;
      for (const set of tracked.values()) count += set.size;
      return count;
    },
    trackedFor(assetId) {
      return [...(tracked.get(assetId) ?? [])];
    },
    stats() {
      let live = 0;
      for (const set of tracked.values()) live += set.size;
      return { minted, revoked, live };
    },
  };
}
