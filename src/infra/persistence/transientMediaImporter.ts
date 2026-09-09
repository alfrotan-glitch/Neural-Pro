/**
 * Turns a live browser-local handle (blob:/data:) into a durable asset.
 *
 * This is the backfill step that makes Save work even for code paths that still
 * assign `URL.createObjectURL(...)` into clip properties: instead of persisting
 * the handle (which would be dead after reload) the bytes are captured and the
 * clip is rewritten to reference an `AssetId`.
 *
 * When the handle is already dead — the exact situation after a reload of a V1
 * save — the import returns `null` and the caller marks the clip
 * `mediaUnresolved`. It never pretends to have succeeded.
 */

import type { AssetId, AssetKind, AssetRecord, NewAssetMeta } from '../../domain/assets/types';
import { inferAssetKind } from './mediaProbe';
import type { AssetRegistry } from '../../domain/assets/AssetRegistry';

export interface TransientImportHint {
  readonly clipId: string;
  readonly fileName?: string | null;
  readonly mimeType?: string | null;
  readonly kind?: AssetKind | null;
  readonly role?: NewAssetMeta['role'];
}

export interface ImportedMedia {
  readonly assetId: AssetId;
  readonly record: AssetRecord;
}

export interface TransientMediaImporter {
  /** `null` when the handle no longer resolves (dead blob URL, revoked, cross-document). */
  importUrl(url: string, hint: TransientImportHint): Promise<ImportedMedia | null>;
}

export interface TransientImporterOptions {
  readonly registry: AssetRegistry;
  /** Injectable for tests and for runtimes where `fetch` cannot read blob URLs. */
  readonly fetchBlob?: (url: string) => Promise<Blob | null>;
}

async function defaultFetchBlob(url: string): Promise<Blob | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await response.blob();
  } catch {
    return null;
  }
}

export function createTransientMediaImporter(options: TransientImporterOptions): TransientMediaImporter {
  const fetchBlob = options.fetchBlob ?? defaultFetchBlob;

  return {
    async importUrl(url, hint) {
      const blob = await fetchBlob(url);
      if (!blob || blob.size === 0) return null;

      const mimeType = hint.mimeType || blob.type || 'application/octet-stream';
      const kind = hint.kind ?? inferAssetKind(mimeType, hint.fileName ?? null);
      const name = hint.fileName?.trim() ? hint.fileName.trim() : `imported-${kind}`;

      const probe = await options.registry.probeFrom(blob, mimeType);
      const assetId = await options.registry.put(blob, {
        kind,
        mimeType,
        name,
        duration: probe.duration,
        width: probe.width,
        height: probe.height,
        sampleRate: probe.sampleRate,
        channels: probe.channels,
        source: { type: 'file', fileName: name },
        role: hint.role ?? 'source',
      });

      const record = await options.registry.getRecord(assetId);
      if (!record) return null;
      return { assetId, record };
    },
  };
}
