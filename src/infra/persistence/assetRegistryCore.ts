/**
 * AssetRegistry behaviour shared by every backing store.
 *
 * The registry owns: identity, content-hash dedupe, one-time measurement,
 * object-URL ownership and soft deletion. Backing stores only move bytes and
 * records, which keeps `IndexedDbAssetRegistry` and `MemoryAssetRegistry`
 * behaviourally identical — the difference is durability, not semantics.
 */

import type { AssetId, AssetRecord, MediaProbe, NewAssetMeta } from '../../domain/assets/types';
import { createAssetId } from '../../domain/assets/types';
import type { AssetRegistry } from '../../domain/assets/AssetRegistry';
import { PersistenceError, asPersistenceError, isQuotaError } from './errors';
import { createObjectUrlTracker, type ObjectUrlTracker } from './objectUrlTracker';
import { probeBlob, inferAssetKind, emptyProbe } from './mediaProbe';

export interface AssetBlobStore {
  readonly kind: string;
  write(id: AssetId, blob: Blob): Promise<void>;
  read(id: AssetId): Promise<Blob | null>;
  remove(id: AssetId): Promise<void>;
  writeRecord(record: AssetRecord): Promise<void>;
  readRecord(id: AssetId): Promise<AssetRecord | null>;
  listRecords(): Promise<AssetRecord[]>;
  removeRecord(id: AssetId): Promise<void>;
}

export interface AssetRegistryOptions {
  readonly store: AssetBlobStore;
  readonly tracker?: ObjectUrlTracker;
  readonly uuid?: () => string;
  readonly clock?: () => number;
  /**
   * Provides the set of asset ids still referenced by a project document.
   * Returning `null` means "I cannot tell" — the registry then treats every asset
   * as referenced, because deleting on a guess is worse than keeping.
   */
  readonly referenceProvider?: () => Promise<ReadonlySet<AssetId> | null> | ReadonlySet<AssetId> | null;
}

export interface ManagedAssetRegistry extends AssetRegistry {
  readonly tracker: ObjectUrlTracker;
  readonly storeKind: string;
}

export async function hashBlob(blob: Blob): Promise<string | null> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle || typeof blob.arrayBuffer !== 'function') return null;
  try {
    const buffer = await blob.arrayBuffer();
    const digest = await subtle.digest('SHA-256', buffer);
    const bytes = new Uint8Array(digest);
    let hex = '';
    for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
    return `sha256:${hex}`;
  } catch {
    return null;
  }
}

function defaultUuid(): string {
  const cryptoObject = globalThis.crypto;
  if (cryptoObject?.randomUUID) return cryptoObject.randomUUID();
  throw new Error('Secure UUID generation is unavailable in this runtime');
}

/**
 * Creates a registry over any `AssetBlobStore`.
 *
 * Dedupe: two `put()` calls with identical bytes return the SAME AssetId, so a
 * re-import cannot duplicate gigabytes. Identity is therefore content-derived
 * and stable across reloads.
 */
export function createAssetRegistry(options: AssetRegistryOptions): ManagedAssetRegistry {
  const { store } = options;
  const tracker = options.tracker ?? createObjectUrlTracker();
  const uuid = options.uuid ?? defaultUuid;
  const clock = options.clock ?? (() => Date.now());

  const probeCache = new Map<AssetId, Promise<MediaProbe>>();

  const buildRecord = async (blob: Blob, meta: NewAssetMeta): Promise<AssetRecord> => {
    const mimeType = meta.mimeType || blob.type || 'application/octet-stream';
    const kind = meta.kind ?? inferAssetKind(mimeType, meta.name);
    const needsProbe =
      meta.duration === undefined &&
      meta.width === undefined &&
      meta.sampleRate === undefined;

    let probe: MediaProbe = emptyProbe(kind, mimeType);
    if (needsProbe) {
      probe = await probeWithTrackedUrl(blob, mimeType);
    } else {
      probe = {
        kind,
        mimeType,
        duration: meta.duration ?? null,
        width: meta.width ?? null,
        height: meta.height ?? null,
        sampleRate: meta.sampleRate ?? null,
        channels: meta.channels ?? null,
      };
    }

    const contentHash = meta.contentHash !== undefined ? meta.contentHash : await hashBlob(blob);

    return {
      id: meta.id ?? createAssetId(uuid()),
      kind,
      name: meta.name || 'untitled',
      mimeType,
      byteSize: blob.size,
      duration: probe.duration,
      width: probe.width,
      height: probe.height,
      sampleRate: probe.sampleRate,
      channels: probe.channels,
      createdAt: meta.createdAt ?? clock(),
      source: meta.source,
      contentHash,
      role: meta.role ?? 'source',
      deletedAt: null,
    };
  };

  /** Probing needs a URL; it is minted and revoked through the tracker so INV-008 stays intact. */
  const probeWithTrackedUrl = async (blob: Blob, mimeType: string): Promise<MediaProbe> => {
    const probeId = createAssetId(`probe-${uuid()}`);
    let url: string | null = null;
    try {
      url = tracker.mint(probeId, blob);
    } catch {
      return emptyProbe(inferAssetKind(mimeType), mimeType);
    }
    try {
      return await probeBlob(blob, mimeType, url);
    } finally {
      if (url) tracker.release(probeId, url);
    }
  };

  const registry: ManagedAssetRegistry = {
    tracker,
    storeKind: store.kind,

    async put(blob, meta) {
      if (!blob || typeof blob.size !== 'number') {
        throw new PersistenceError('PERSISTENCE_FAILED', 'Cannot store an asset without bytes.');
      }
      const record = await buildRecord(blob, meta);

      if (record.contentHash && !meta.preserveIdentity) {
        const existing = (await store.listRecords()).find(
          (candidate) => candidate.contentHash === record.contentHash && candidate.deletedAt === null,
        );
        if (existing && existing.id !== record.id) {
          // Same bytes, already durable: reuse identity instead of duplicating storage.
          const existingBlob = await store.read(existing.id);
          if (existingBlob) return existing.id;
        }
      }

      try {
        await store.write(record.id, blob);
        await store.writeRecord(record);
      } catch (error) {
        if (isQuotaError(error)) {
          throw new PersistenceError('PERSISTENCE_QUOTA', 'Storage quota exceeded while writing asset bytes.', {
            assetId: record.id,
            cause: error,
          });
        }
        throw asPersistenceError(error, 'Asset write failed');
      }
      return record.id;
    },

    async get(id) {
      const record = await store.readRecord(id);
      if (!record || record.deletedAt !== null) return null;
      return store.read(id);
    },

    async getRecord(id) {
      const record = await store.readRecord(id);
      if (!record || record.deletedAt !== null) return null;
      return record;
    },

    async resolveUrl(id) {
      const record = await store.readRecord(id);
      if (!record || record.deletedAt !== null) {
        throw new PersistenceError('ASSET_MISSING', `Asset ${id} is not available in this browser profile.`, {
          assetId: id,
        });
      }
      if (record.source.type === 'url') {
        // Remote assets are addressed by their origin; no object URL is minted,
        // so there is nothing to revoke (contract media-assets §5).
        return record.source.href;
      }
      const blob = await store.read(id);
      if (!blob) {
        throw new PersistenceError('ASSET_MISSING', `Asset ${id} has a record but no bytes.`, { assetId: id });
      }
      return tracker.mint(id, blob);
    },

    releaseUrl(id, url) {
      tracker.release(id, url);
    },

    releaseAll() {
      return tracker.releaseAll();
    },

    trackedUrlCount() {
      return tracker.count();
    },

    async measure(id) {
      const cached = probeCache.get(id);
      if (cached) return cached;
      const promise = (async () => {
        const record = await store.readRecord(id);
        if (!record) {
          throw new PersistenceError('ASSET_MISSING', `Asset ${id} is not available for measurement.`, {
            assetId: id,
          });
        }
        if (record.duration !== null || record.width !== null || record.sampleRate !== null) {
          return {
            kind: record.kind,
            mimeType: record.mimeType,
            duration: record.duration,
            width: record.width,
            height: record.height,
            sampleRate: record.sampleRate,
            channels: record.channels,
          } satisfies MediaProbe;
        }
        const blob = await store.read(id);
        if (!blob) {
          return {
            kind: record.kind,
            mimeType: record.mimeType,
            duration: null,
            width: null,
            height: null,
            sampleRate: null,
            channels: null,
          } satisfies MediaProbe;
        }
        const probe = await probeWithTrackedUrl(blob, record.mimeType);
        const updated: AssetRecord = { ...record, ...probe };
        await store.writeRecord(updated);
        return probe;
      })();
      probeCache.set(id, promise);
      try {
        return await promise;
      } finally {
        probeCache.delete(id);
      }
    },

    async probeFrom(blob, mimeType) {
      return probeWithTrackedUrl(blob, mimeType || blob.type || 'application/octet-stream');
    },

    async list() {
      const records = await store.listRecords();
      return records.filter((record) => record.deletedAt === null);
    },

    async delete(id) {
      const record = await store.readRecord(id);
      if (!record) return;
      // Soft delete: bytes stay until the collector reclaims them, so an undo or a
      // crashed session can still restore the media.
      await store.writeRecord({ ...record, deletedAt: clock() });
      for (const url of tracker.trackedFor(id)) tracker.release(id, url);
    },

    async orphaned() {
      const provider = options.referenceProvider;
      const referenced = provider ? await provider() : null;
      const records = await store.listRecords();
      if (!referenced) {
        // No reference information ⇒ assume everything is referenced. Deleting data
        // on a guess is worse than keeping it.
        return records.filter((record) => record.deletedAt !== null).map((record) => record.id);
      }
      return records.filter((record) => !referenced.has(record.id)).map((record) => record.id);
    },
  };

  return registry;
}
