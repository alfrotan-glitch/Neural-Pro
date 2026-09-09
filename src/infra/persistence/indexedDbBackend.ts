/**
 * IndexedDB backing store for the `neuralpro` database (ADR-006, contract §6).
 *
 *   projects      key: projectId            value: sealed envelope JSON string
 *   assets        key: AssetId              value: Blob (bytes, never base64)
 *   assetRecords  key: AssetId              value: AssetRecord
 *
 * Atomicity: `transaction()` performs all writes inside ONE `readwrite`
 * transaction, so a crash mid-save leaves the previous document untouched. That
 * single property is what makes Save → Reload → Continue crash-safe rather than
 * "usually fine".
 */

import { PersistenceError, isQuotaError } from './errors';
import type { AssetBlobStore } from './assetRegistryCore';
import type { AssetId, AssetRecord } from '../../domain/assets/types';

export const DATABASE_NAME = 'neuralpro';
export const DATABASE_VERSION = 1;
export const PROJECT_STORE = 'projects';
export const ASSET_STORE = 'assets';
export const ASSET_RECORD_STORE = 'assetRecords';

export interface TransactionContext {
  get(key: string): Promise<string | null>;
  put(key: string, value: string): void;
  delete(key: string): void;
}

export interface KeyValueBackend {
  readonly kind: 'indexeddb' | 'memory';
  get(key: string): Promise<string | null>;
  put(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  keys(prefix?: string): Promise<string[]>;
  /** Atomic multi-key write. Everything commits, or nothing does. */
  transaction<T>(mutate: (tx: TransactionContext) => Promise<T>): Promise<T>;
  close(): void;
}

export interface IDBRequestLike<T> {
  result: T;
  error: DOMException | null;
  onsuccess: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export interface IDBObjectStoreLike {
  get(key: string): IDBRequestLike<unknown>;
  put(value: unknown, key?: string): IDBRequestLike<unknown>;
  delete(key: string): IDBRequestLike<unknown>;
  getAllKeys(): IDBRequestLike<unknown[]>;
  clear(): IDBRequestLike<unknown>;
}

export interface IDBTransactionLike {
  objectStore(name: string): IDBObjectStoreLike;
  abort(): void;
  error: DOMException | null;
  onabort: ((event: unknown) => void) | null;
  onerror: ((event: unknown) => void) | null;
  oncomplete: ((event: unknown) => void) | null;
}

export interface IDBDatabaseLike {
  transaction(stores: string | string[], mode?: string): IDBTransactionLike;
  createObjectStore(name: string, options?: { keyPath?: string }): IDBObjectStoreLike;
  objectStoreNames: { contains(name: string): boolean };
  close(): void;
  onversionchange: ((event: unknown) => void) | null;
}

interface IDBOpenRequestLike extends IDBRequestLike<IDBDatabaseLike> {
  onupgradeneeded: ((event: unknown) => void) | null;
  onblocked: ((event: unknown) => void) | null;
}

export interface IndexedDbLike {
  open(name: string, version?: number): IDBOpenRequestLike;
}

function getIndexedDb(): IndexedDbLike | null {
  const candidate = (globalThis as { indexedDB?: IndexedDbLike }).indexedDB;
  if (!candidate || typeof candidate.open !== 'function') return null;
  return candidate;
}

/** True when IndexedDB exists AND can actually be opened (private modes lie). */
export function isIndexedDbAvailable(): boolean {
  return getIndexedDb() !== null;
}

function requestToPromise<T>(request: IDBRequestLike<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export function openNeuralProDatabase(
  name: string = DATABASE_NAME,
  version: number = DATABASE_VERSION,
): Promise<IDBDatabaseLike> {
  const indexedDb = getIndexedDb();
  if (!indexedDb) {
    return Promise.reject(
      new PersistenceError('DEPENDENCY_UNAVAILABLE', 'IndexedDB is not available in this runtime.'),
    );
  }

  return new Promise<IDBDatabaseLike>((resolve, reject) => {
    const request = indexedDb.open(name, version);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PROJECT_STORE)) db.createObjectStore(PROJECT_STORE);
      if (!db.objectStoreNames.contains(ASSET_STORE)) db.createObjectStore(ASSET_STORE);
      if (!db.objectStoreNames.contains(ASSET_RECORD_STORE)) db.createObjectStore(ASSET_RECORD_STORE);
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error ?? new Error('Unable to open the IndexedDB database'));
    request.onblocked = () => reject(new Error('IndexedDB upgrade blocked by another open connection'));
  });
}

/** Document backend over the `projects` object store. */
export function createIndexedDbKeyValueBackend(db: IDBDatabaseLike): KeyValueBackend {
  return {
    kind: 'indexeddb',

    async get(key) {
      const tx = db.transaction(PROJECT_STORE, 'readonly');
      const value = await requestToPromise(tx.objectStore(PROJECT_STORE).get(key));
      return typeof value === 'string' ? value : null;
    },

    async put(key, value) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(PROJECT_STORE, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB write aborted'));
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB write failed'));
        tx.objectStore(PROJECT_STORE).put(value, key);
      });
    },

    async delete(key) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(PROJECT_STORE, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB delete aborted'));
        tx.objectStore(PROJECT_STORE).delete(key);
      });
    },

    async keys(prefix) {
      const tx = db.transaction(PROJECT_STORE, 'readonly');
      const all = await requestToPromise(tx.objectStore(PROJECT_STORE).getAllKeys());
      const keys = (all ?? []).map((key) => String(key));
      return prefix ? keys.filter((key) => key.startsWith(prefix)) : keys;
    },

    async transaction(mutate) {
      const tx = db.transaction(PROJECT_STORE, 'readwrite');
      const store = tx.objectStore(PROJECT_STORE);
      const staged = new Map<string, string | null>();

      const context: TransactionContext = {
        async get(key) {
          if (staged.has(key)) {
            const value = staged.get(key);
            return value ?? null;
          }
          const value = await requestToPromise(store.get(key));
          return typeof value === 'string' ? value : null;
        },
        put(key, value) {
          staged.set(key, value);
        },
        delete(key) {
          staged.set(key, null);
        },
      };

      try {
        const result = await mutate(context);
        for (const [key, value] of staged) {
          if (value === null) store.delete(key);
          else store.put(value, key);
        }
        await new Promise<void>((resolve, reject) => {
          tx.oncomplete = () => resolve();
          tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
          tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
        });
        return result;
      } catch (error) {
        try {
          tx.abort();
        } catch {
          /* already finished */
        }
        if (isQuotaError(error)) throw error;
        throw error;
      }
    },

    close() {
      db.close();
    },
  };
}

/** Asset bytes + records over the `assets` / `assetRecords` object stores. */
export function createIndexedDbAssetStore(db: IDBDatabaseLike): AssetBlobStore {
  const runWrite = (storeName: string, apply: (store: IDBObjectStoreLike) => void): Promise<void> =>
    new Promise<void>((resolve, reject) => {
      const tx = db.transaction(storeName, 'readwrite');
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error ?? new Error(`${storeName} write aborted`));
      tx.onerror = () => reject(tx.error ?? new Error(`${storeName} write failed`));
      apply(tx.objectStore(storeName));
    });

  return {
    kind: 'indexeddb',

    async write(id, blob) {
      await runWrite(ASSET_STORE, (store) => {
        store.put(blob, id);
      });
    },

    async read(id) {
      const tx = db.transaction(ASSET_STORE, 'readonly');
      const value = await requestToPromise(tx.objectStore(ASSET_STORE).get(id));
      if (!value) return null;
      if (typeof Blob !== 'undefined' && value instanceof Blob) return value;
      if (typeof (value as Blob).size === 'number' && typeof (value as Blob).arrayBuffer === 'function') {
        return value as Blob;
      }
      return null;
    },

    async remove(id) {
      await runWrite(ASSET_STORE, (store) => {
        store.delete(id);
      });
    },

    async writeRecord(record) {
      await runWrite(ASSET_RECORD_STORE, (store) => {
        store.put(structuredClone(record), record.id);
      });
    },

    async readRecord(id: AssetId) {
      const tx = db.transaction(ASSET_RECORD_STORE, 'readonly');
      const value = await requestToPromise(tx.objectStore(ASSET_RECORD_STORE).get(id));
      return (value as AssetRecord | undefined) ?? null;
    },

    async listRecords() {
      const tx = db.transaction(ASSET_RECORD_STORE, 'readonly');
      const store = tx.objectStore(ASSET_RECORD_STORE);
      const keys = await requestToPromise(store.getAllKeys());
      const records: AssetRecord[] = [];
      for (const key of keys ?? []) {
        const record = (await requestToPromise(store.get(String(key)))) as AssetRecord | undefined;
        if (record) records.push(record);
      }
      return records;
    },

    async removeRecord(id) {
      await runWrite(ASSET_RECORD_STORE, (store) => {
        store.delete(id);
      });
    },
  };
}
