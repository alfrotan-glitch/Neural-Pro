/**
 * Portable project bundle (`.neuralpro`).
 *
 * Why this exists: IndexedDB is the right durable default, but it is still
 * browser-profile storage — it is denied in some private modes, partitioned in
 * some embedded frames, and evicted under storage pressure. A bundle is the
 * durability mechanism that does not depend on any of that: one file, containing
 * the document and every asset's bytes, that the user can keep.
 *
 * It is also the backup/restore path and the only way to move a project between
 * profiles or machines.
 *
 * Format: a ZIP archive using the STORE method (no compression), so the writer is
 * small, dependency-free and byte-deterministic — the same project always
 * produces the same file, which is what makes it testable. Compression was
 * deliberately skipped: media is already compressed, and a dependency-free
 * deterministic writer matters more than a few percent here.
 *
 *   manifest.json          BundleManifestV1 (document + asset index)
 *   assets/<AssetId>       raw bytes, one entry per asset
 */

import type { AssetId, AssetRecord } from '../../domain/assets/types';
import type { AssetRegistry } from '../../domain/assets/AssetRegistry';
import { PersistenceError } from './errors';
import {
  assertDocumentInternals,
  assertOrderFingerprint,
  collectDocumentAssetIds,
  computeOrderFingerprint,
  type ProjectDocumentV2,
} from './documentContract';
import { checksumOf, verifyChecksum } from './integrity';
import { hashBlob } from './assetRegistryCore';
import type { ProjectDocumentStore } from './projectDocumentStore';
import type { MediaMissingWarning } from './mediaHydration';

export const BUNDLE_FORMAT = 'neuralpro-project-bundle';
export const BUNDLE_VERSION = 1 as const;
export const BUNDLE_EXTENSION = 'neuralpro';
export const BUNDLE_MANIFEST_ENTRY = 'manifest.json';
export const BUNDLE_ASSET_PREFIX = 'assets/';

export interface BundleAssetEntry {
  readonly id: AssetId;
  readonly entry: string;
  readonly byteSize: number;
  readonly contentHash: string | null;
}

export interface BundleManifestV1 {
  readonly format: typeof BUNDLE_FORMAT;
  readonly bundleVersion: typeof BUNDLE_VERSION;
  readonly createdAt: number;
  readonly projectId: string;
  readonly name: string;
  readonly document: ProjectDocumentV2;
  readonly orderFingerprint: string;
  readonly documentChecksum: string;
  readonly documentChecksumAlgorithm: 'sha-256' | 'fnv1a-64';
  readonly assets: readonly BundleAssetEntry[];
  /** Assets referenced by the document whose bytes were not available at export. */
  readonly missingAssets: readonly AssetId[];
}

/* ------------------------------------------------------------------ CRC-32 */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let c = i;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ (bytes[i] ?? 0)) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/* ------------------------------------------------------------- ZIP (store) */

export interface ZipEntry {
  readonly name: string;
  readonly data: Uint8Array;
}

const LOCAL_HEADER_SIGNATURE = 0x04034b50;
const CENTRAL_HEADER_SIGNATURE = 0x02014b50;
const EOCD_SIGNATURE = 0x06054b50;
/** Fixed DOS timestamp (1980-01-01) so output bytes are deterministic. */
const DOS_TIME = 0;
const DOS_DATE = 0x21;

export function createZip(entries: readonly ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const checksum = crc32(entry.data);

    const local = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, LOCAL_HEADER_SIGNATURE, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true); // UTF-8 names
    localView.setUint16(8, 0, true); // store
    localView.setUint16(10, DOS_TIME, true);
    localView.setUint16(12, DOS_DATE, true);
    localView.setUint32(14, checksum, true);
    localView.setUint32(18, entry.data.length, true);
    localView.setUint32(22, entry.data.length, true);
    localView.setUint16(26, nameBytes.length, true);
    localView.setUint16(28, 0, true);
    local.set(nameBytes, 30);

    chunks.push(local, entry.data);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    centralView.setUint32(0, CENTRAL_HEADER_SIGNATURE, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint16(10, 0, true);
    centralView.setUint16(12, DOS_TIME, true);
    centralView.setUint16(14, DOS_DATE, true);
    centralView.setUint32(16, checksum, true);
    centralView.setUint32(20, entry.data.length, true);
    centralView.setUint32(24, entry.data.length, true);
    centralView.setUint16(28, nameBytes.length, true);
    centralView.setUint16(30, 0, true);
    centralView.setUint16(32, 0, true);
    centralView.setUint16(34, 0, true);
    centralView.setUint16(36, 0, true);
    centralView.setUint32(38, 0, true);
    centralView.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);
    central.push(centralHeader);

    offset += local.length + entry.data.length;
  }

  const centralSize = central.reduce((total, part) => total + part.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  eocdView.setUint32(0, EOCD_SIGNATURE, true);
  eocdView.setUint16(4, 0, true);
  eocdView.setUint16(6, 0, true);
  eocdView.setUint16(8, entries.length, true);
  eocdView.setUint16(10, entries.length, true);
  eocdView.setUint32(12, centralSize, true);
  eocdView.setUint32(16, offset, true);
  eocdView.setUint16(20, 0, true);

  const total = offset + centralSize + eocd.length;
  const out = new Uint8Array(total);
  let cursor = 0;
  for (const chunk of [...chunks, ...central, eocd]) {
    out.set(chunk, cursor);
    cursor += chunk.length;
  }
  return out;
}

export function readZip(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();

  // Locate the end-of-central-directory record (scan backwards; no comment support).
  let eocdOffset = -1;
  for (let i = bytes.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === EOCD_SIGNATURE) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new PersistenceError('BUNDLE_CORRUPT', 'Not a valid bundle: the ZIP directory is missing.');
  }

  const entryCount = view.getUint16(eocdOffset + 10, true);
  const centralOffset = view.getUint32(eocdOffset + 16, true);

  const entries: ZipEntry[] = [];
  let cursor = centralOffset;

  for (let i = 0; i < entryCount; i += 1) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== CENTRAL_HEADER_SIGNATURE) {
      throw new PersistenceError('BUNDLE_CORRUPT', `Bundle directory entry ${i} is malformed.`);
    }
    const checksum = view.getUint32(cursor + 16, true);
    const size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength));
    cursor += 46 + nameLength + extraLength + commentLength;

    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== LOCAL_HEADER_SIGNATURE) {
      throw new PersistenceError('BUNDLE_CORRUPT', `Bundle entry "${name}" points at an invalid local header.`);
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    if (dataStart + size > bytes.length) {
      throw new PersistenceError('BUNDLE_CORRUPT', `Bundle entry "${name}" is truncated.`);
    }
    const data = bytes.slice(dataStart, dataStart + size);
    if (crc32(data) !== checksum) {
      throw new PersistenceError('BUNDLE_CORRUPT', `Bundle entry "${name}" failed its CRC check.`);
    }
    entries.push({ name, data });
  }

  return entries;
}

/* ------------------------------------------------------------- export/import */

export interface ExportBundleInput {
  readonly projectId: string;
  readonly registry: AssetRegistry;
  readonly documents: ProjectDocumentStore;
  readonly now?: () => number;
}

export interface ExportBundleResult {
  readonly blob: Blob;
  readonly fileName: string;
  readonly byteSize: number;
  readonly assetCount: number;
  readonly warnings: MediaMissingWarning[];
  readonly missingAssets: readonly AssetId[];
}

/**
 * Exports a project as a portable bundle.
 *
 * A referenced asset whose bytes are unavailable does NOT abort the export — a
 * partial backup is better than none — but it is recorded in the manifest and
 * returned as a warning, so the user knows the file is not complete.
 */
export async function exportProjectBundle(input: ExportBundleInput): Promise<ExportBundleResult> {
  const loaded = await input.documents.load(input.projectId);
  if (!loaded.found || !loaded.document) {
    throw new PersistenceError(
      'PERSISTENCE_CORRUPT',
      loaded.error?.message ?? `Project ${input.projectId} has no readable document to export.`,
      { projectId: input.projectId },
    );
  }

  const document = loaded.document;
  const referenced = collectDocumentAssetIds(document);
  const recordsById = new Map<string, AssetRecord>(document.assets.map((record) => [record.id, record]));

  const assets: BundleAssetEntry[] = [];
  const missingAssets: AssetId[] = [];
  const warnings: MediaMissingWarning[] = [];
  const entries: ZipEntry[] = [];

  for (const assetId of referenced) {
    const blob = await input.registry.get(assetId);
    if (!blob) {
      missingAssets.push(assetId);
      warnings.push({
        clipId: '',
        trackId: '',
        clipName: recordsById.get(assetId)?.name ?? null,
        assetId,
        reason: 'ASSET_MISSING',
        message: `Asset ${assetId} has no bytes in this profile, so it is not included in the bundle.`,
      });
      continue;
    }
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const entry = `${BUNDLE_ASSET_PREFIX}${assetId}`;
    assets.push({
      id: assetId,
      entry,
      byteSize: bytes.length,
      contentHash: recordsById.get(assetId)?.contentHash ?? null,
    });
    entries.push({ name: entry, data: bytes });
  }

  const { algorithm, checksum } = await checksumOf(document);
  const manifest: BundleManifestV1 = {
    format: BUNDLE_FORMAT,
    bundleVersion: BUNDLE_VERSION,
    createdAt: (input.now ?? (() => Date.now()))(),
    projectId: document.projectId,
    name: document.name,
    document,
    orderFingerprint: computeOrderFingerprint(document.project.tracks),
    documentChecksum: checksum,
    documentChecksumAlgorithm: algorithm,
    assets,
    missingAssets,
  };

  entries.unshift({
    name: BUNDLE_MANIFEST_ENTRY,
    data: new TextEncoder().encode(JSON.stringify(manifest)),
  });

  const zip = createZip(entries);
  const fileName = `${sanitizeFileName(document.name || document.projectId)}.${BUNDLE_EXTENSION}`;

  return {
    blob: new Blob([zip as unknown as BlobPart], { type: 'application/zip' }),
    fileName,
    byteSize: zip.length,
    assetCount: assets.length,
    warnings,
    missingAssets,
  };
}

export interface ImportBundleInput {
  readonly blob: Blob;
  readonly registry: AssetRegistry;
  readonly documents: ProjectDocumentStore;
  /** Import under a different name (defaults to the name stored in the bundle). */
  readonly projectName?: string;
}

export interface ImportBundleResult {
  readonly projectId: string;
  readonly name: string;
  readonly document: ProjectDocumentV2;
  readonly revision: number;
  readonly restoredAssets: AssetId[];
  readonly reusedAssets: AssetId[];
  readonly missingAssets: readonly AssetId[];
  readonly warnings: MediaMissingWarning[];
}

/**
 * Imports a bundle.
 *
 * Order matters for safety: asset bytes are written first, then the document in a
 * single atomic transaction. If anything fails before the document write there is
 * no half-imported project — only some possibly-unused asset bytes, which the
 * orphan collector reclaims later.
 *
 * An asset id that already exists with DIFFERENT bytes is a conflict and aborts the
 * import: silently overwriting would corrupt the project that already holds it.
 */
export async function importProjectBundle(input: ImportBundleInput): Promise<ImportBundleResult> {
  const bytes = new Uint8Array(await input.blob.arrayBuffer());
  const entries = readZip(bytes);

  const manifestEntry = entries.find((entry) => entry.name === BUNDLE_MANIFEST_ENTRY);
  if (!manifestEntry) {
    throw new PersistenceError('BUNDLE_CORRUPT', 'Bundle has no manifest.json entry.');
  }

  let manifest: BundleManifestV1;
  try {
    manifest = JSON.parse(new TextDecoder().decode(manifestEntry.data)) as BundleManifestV1;
  } catch (error) {
    throw new PersistenceError('BUNDLE_CORRUPT', 'Bundle manifest is not valid JSON.', { cause: error });
  }

  if (manifest.format !== BUNDLE_FORMAT) {
    throw new PersistenceError('BUNDLE_CORRUPT', `Not a Neural-Pro bundle (format: ${String(manifest.format)}).`);
  }
  if (manifest.bundleVersion !== BUNDLE_VERSION) {
    throw new PersistenceError(
      'PERSISTENCE_UNSUPPORTED_VERSION',
      `Bundle version ${String(manifest.bundleVersion)} is not supported by this build (supported: ${BUNDLE_VERSION}).`,
      { foundVersion: manifest.bundleVersion, supportedVersions: [BUNDLE_VERSION] },
    );
  }
  if (!manifest.document || typeof manifest.document !== 'object') {
    throw new PersistenceError('BUNDLE_CORRUPT', 'Bundle manifest has no project document.');
  }

  // Same guarantees as the IndexedDB read path.
  const ok = await verifyChecksum(manifest.document, {
    algorithm: manifest.documentChecksumAlgorithm,
    checksum: manifest.documentChecksum,
  });
  if (!ok) {
    throw new PersistenceError('BUNDLE_CORRUPT', 'Bundle document failed its integrity checksum.');
  }
  assertOrderFingerprint(manifest.document, manifest.orderFingerprint);
  assertDocumentInternals(manifest.document);

  const entriesByName = new Map(entries.map((entry) => [entry.name, entry]));
  const restoredAssets: AssetId[] = [];
  const reusedAssets: AssetId[] = [];
  const missingAssets: AssetId[] = [...(manifest.missingAssets ?? [])];
  const warnings: MediaMissingWarning[] = [];

  // 1. bytes + records
  for (const asset of manifest.assets ?? []) {
    const record = (manifest.document.assets ?? []).find((candidate) => candidate.id === asset.id);
    if (!record) {
      missingAssets.push(asset.id);
      continue;
    }

    const existing = await input.registry.getRecord(asset.id);
    if (existing && existing.contentHash && record.contentHash && existing.contentHash !== record.contentHash) {
      throw new PersistenceError(
        'PERSISTENCE_CONFLICT',
        `Asset ${asset.id} already exists in this profile with different content; refusing to overwrite it.`,
        { assetId: asset.id },
      );
    }
    if (existing && await input.registry.get(asset.id)) {
      reusedAssets.push(asset.id);
      continue;
    }

    const entry = entriesByName.get(asset.entry);
    if (!entry) {
      missingAssets.push(asset.id);
      warnings.push({
        clipId: '',
        trackId: '',
        clipName: record.name,
        assetId: asset.id,
        reason: 'ASSET_MISSING',
        message: `Asset "${record.name}" is listed in the bundle but its bytes are not in the file.`,
      });
      continue;
    }

    const blob = new Blob([entry.data as unknown as BlobPart], { type: record.mimeType });
    // R9 (verify on read): the ZIP CRC catches truncation, the content hash catches
    // a payload that was swapped for something the same length.
    if (asset.byteSize !== entry.data.length) {
      throw new PersistenceError(
        'BUNDLE_CORRUPT',
        `Asset "${record.name}" is ${entry.data.length} bytes in the file but the manifest records ${asset.byteSize}.`,
        { assetId: record.id },
      );
    }
    const actualHash = await hashBlob(blob);
    if (record.contentHash && actualHash && actualHash !== record.contentHash) {
      throw new PersistenceError(
        'BUNDLE_CORRUPT',
        `Asset "${record.name}" does not match the content hash recorded in the bundle.`,
        { assetId: record.id },
      );
    }
    const writtenId = await input.registry.put(blob, {
      id: record.id,
      kind: record.kind,
      mimeType: record.mimeType,
      name: record.name,
      duration: record.duration,
      width: record.width,
      height: record.height,
      sampleRate: record.sampleRate,
      channels: record.channels,
      source: record.source,
      role: record.role,
      contentHash: record.contentHash,
      createdAt: record.createdAt,
      // The document references THIS id; the content-hash dedupe must not swap it.
      preserveIdentity: true,
    });
    if (writtenId !== record.id) {
      throw new PersistenceError(
        'PERSISTENCE_CONFLICT',
        `Asset ${record.id} was stored under a different identity (${writtenId}); refusing to import a document that would point at nothing.`,
        { assetId: record.id },
      );
    }
    restoredAssets.push(record.id);
  }

  for (const assetId of missingAssets) {
    if (warnings.some((warning) => warning.assetId === assetId)) continue;
    warnings.push({
      clipId: '',
      trackId: '',
      clipName: null,
      assetId,
      reason: 'ASSET_MISSING',
      message: `Asset ${assetId} is referenced by the bundle but was not available; the clip will need a relink.`,
    });
  }

  // 2. the document, atomically. A rename is applied here, after verification, so
  //    the checksum we validated still describes the bytes we received.
  const requestedName = input.projectName?.trim();
  const document = requestedName && requestedName !== manifest.document.name
    ? { ...manifest.document, name: requestedName }
    : manifest.document;
  const saved = await input.documents.save(document);

  return {
    projectId: document.projectId,
    name: document.name,
    document,
    revision: saved.revision,
    restoredAssets,
    reusedAssets,
    missingAssets,
    warnings,
  };
}

function sanitizeFileName(name: string): string {
  const cleaned = name.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  return cleaned || 'project';
}
