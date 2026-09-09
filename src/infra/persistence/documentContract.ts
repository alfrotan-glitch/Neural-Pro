/**
 * ProjectDocumentV2 — the durable encoding of a project (WP-05).
 *
 * Normative source: docs/contracts/persistence.md.
 *
 * Rules implemented here:
 *   R1  no `blob:` / `data:` / `file:` / `filesystem:` reference may survive serialisation
 *   R2  every clip media reference is an AssetId or an http(s) remote URL
 *   R3  duration is recomputed with the SAME canonical function the editor uses
 *   R4  an unknown `schemaVersion` is refused, never guessed
 *   R5  the document is a pure function of its inputs — no Date.now(), no randomness
 *   R6  `isPlaying` is never persisted
 *   R7  object URLs are runtime handles and are stripped at the serialisation gate
 *
 * `savedAt` / `revision` deliberately live in the ENVELOPE, not in the document,
 * so that `serializeProjectDocument` is deterministic and its checksum stable.
 */

import type { AssetRecord, AssetId } from '../../domain/assets/types';
import { toDurableMediaProperties } from '../../domain/assets/mediaReferences';
import type { ProjectState, Track } from '../../features/video-studio/project/types/project';
import { assertValidProjectState, normalizeSelectedNodeIds } from '../../features/video-studio/project/validation';
import { calculateProjectDuration, clampProjectTime } from '../../core/engine/projectDuration';
import { normalizeCyberpunkSubscribeProperties } from '../../core/engine/cyberpunkSubscribeModel';
import { PersistenceError } from './errors';
import { canonicalJson, checksumOf, verifyChecksum, type ChecksumAlgorithm } from './integrity';
import { collectClipAssetIds, readClipMediaReference, type ClipLike } from '../../domain/assets/mediaReferences';

export const PROJECT_SCHEMA_VERSION = 2 as const;
export const SUPPORTED_SCHEMA_VERSIONS = [1, PROJECT_SCHEMA_VERSION] as const;
export const ENVELOPE_VERSION = 1 as const;

/** ProjectState without the ephemeral transport flag (R6). */
export type PersistedProjectState = Omit<ProjectState, 'isPlaying'>;

export interface ProjectSettings {
  /** Per-project production settings (export panel state). */
  readonly export?: Readonly<Record<string, unknown>>;
  /** Free-form, project-scoped editor settings. */
  readonly editor?: Readonly<Record<string, unknown>>;
}

export interface ProjectDocumentV2 {
  readonly schemaVersion: typeof PROJECT_SCHEMA_VERSION;
  readonly projectId: string;
  /** Human-facing project name; used to keep the "open by name" UX working. */
  readonly name: string;
  readonly project: PersistedProjectState;
  /** Manifest only — bytes live in the asset store. */
  readonly assets: readonly AssetRecord[];
  readonly settings: ProjectSettings;
  readonly exports: readonly ExportRecordEntry[];
}

export interface ExportRecordEntry {
  readonly id: string;
  readonly assetId: AssetId | null;
  readonly createdAt: number;
  readonly fileName: string;
  readonly byteSize: number | null;
  readonly duration: number | null;
  readonly settings: Readonly<Record<string, unknown>>;
}

/** Storage-level wrapper: integrity + provenance around a document. */
export interface DocumentEnvelope {
  readonly envelopeVersion: typeof ENVELOPE_VERSION;
  readonly projectId: string;
  readonly name: string;
  readonly revision: number;
  readonly savedAt: number;
  readonly schemaVersion: number;
  readonly algorithm: ChecksumAlgorithm;
  readonly checksum: string;
  readonly byteLength: number;
  readonly orderFingerprint: string;
  readonly duration: number;
  /** Set when a compat shim produced this envelope (SHIM-001). */
  readonly migratedFrom?: number;
  readonly document: ProjectDocumentV2;
}

export interface SerializeInput {
  readonly projectId: string;
  readonly name: string;
  readonly state: ProjectState;
  readonly assets: readonly AssetRecord[];
  readonly settings?: ProjectSettings;
  readonly exports?: readonly ExportRecordEntry[];
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Clamps transform fields to the ranges the rest of the app assumes. */
export function normalizePersistedTransform(
  transform: unknown,
): Track['clips'][number]['transform'] {
  const source = transform && typeof transform === 'object' ? (transform as Record<string, unknown>) : {};
  const scale = finiteOr(source.scale, 100);
  const scaleX = finiteOr(source.scaleX, 100);
  const scaleY = finiteOr(source.scaleY, 100);
  const opacity = finiteOr(source.opacity, 100);
  return {
    x: finiteOr(source.x, 0),
    y: finiteOr(source.y, 0),
    scale: scale > 0 ? scale : 100,
    scaleX: scaleX > 0 ? scaleX : 100,
    scaleY: scaleY > 0 ? scaleY : 100,
    rotation: finiteOr(source.rotation, 0),
    opacity: Math.max(0, Math.min(100, opacity)),
  };
}

const CYBERPUNK_SOURCE_IDS = new Set(['st_cyber_sub', 'ef_cyber_sub']);

/**
 * Normalises one track for persistence:
 *  - transform fields clamped,
 *  - runtime media handles removed (R1/R7),
 *  - clip order preserved VERBATIM (array index is z-order — see layerOrder.ts).
 */
export function normalizeTracksForPersistence(tracks: readonly Track[]): Track[] {
  if (!Array.isArray(tracks)) {
    throw new PersistenceError('PERSISTENCE_CORRUPT', 'Project tracks must be an array.');
  }

  return tracks.map((track) => {
    const clips = Array.isArray(track?.clips)
      ? (track.clips as Track['clips']).map((clip) => {
          const properties = toDurableMediaProperties((clip.properties ?? {}) as Record<string, unknown>);
          const normalized: Track['clips'][number] = {
            ...clip,
            transform: normalizePersistedTransform(clip.transform),
            properties: CYBERPUNK_SOURCE_IDS.has(clip?.sourceId)
              ? { ...normalizeCyberpunkSubscribeProperties(properties), ...properties }
              : properties,
          };
          return normalized;
        })
      : [];

    return { ...track, clips };
  });
}

/**
 * Fingerprints track order and clip order inside each track.
 * Verified again on load: a rebuild that reorders clips would silently change
 * preview/export z-order, so the store refuses to hand back such a document.
 */
export function computeOrderFingerprint(tracks: readonly Track[]): string {
  const parts = tracks.map((track) => `${track.id}>${track.clips.map((clip) => clip.id).join(',')}`);
  return canonicalJson(parts);
}

/**
 * Serialises editor state into a durable document.
 *
 * Deterministic (R5): calling it twice with equal inputs yields byte-identical
 * canonical JSON, which is what makes the envelope checksum meaningful.
 */
export function serializeProjectDocument(input: SerializeInput): ProjectDocumentV2 {
  const { state } = input;
  assertValidProjectState(state);

  const tracks = normalizeTracksForPersistence(state.tracks);
  const totalDuration = calculateProjectDuration(tracks);
  const knownClipIds = new Set(tracks.flatMap((track) => track.clips.map((clip) => clip.id)));

  const project: PersistedProjectState = {
    projectId: state.projectId,
    metadata: structuredClone(state.metadata),
    currentTime: clampProjectTime(state.currentTime, totalDuration),
    totalDuration,
    tracks,
    selectedNodeIds: normalizeSelectedNodeIds(tracks, state.selectedNodeIds ?? []).filter((id) => knownClipIds.has(id)),
    ...(state.selectedKeyframeIds
      ? { selectedKeyframeIds: [...new Set(state.selectedKeyframeIds)] }
      : {}),
    ...(state.animations ? { animations: structuredClone(state.animations) } : {}),
  };

  // R6: `isPlaying` is transport state. It is not part of the persisted shape at all.
  const document: ProjectDocumentV2 = {
    schemaVersion: PROJECT_SCHEMA_VERSION,
    projectId: input.projectId,
    name: input.name,
    project,
    assets: structuredClone(input.assets ?? []),
    settings: structuredClone(input.settings ?? {}),
    exports: structuredClone(input.exports ?? []),
  };

  assertNoTransientReferences(document);
  return document;
}

const TRANSIENT_PREFIXES = ['blob:', 'data:', 'file:', 'filesystem:'] as const;

export interface TransientReference {
  readonly path: string;
  readonly prefix: string;
  readonly value: string;
}

/**
 * Walks every string in the document. A single transient reference is a hard
 * failure: persisting it would guarantee a dead media reference after reload.
 */
export function findTransientReferences(document: unknown): TransientReference[] {
  const found: TransientReference[] = [];

  const walk = (value: unknown, path: string): void => {
    if (typeof value === 'string') {
      const lowered = value.trim().toLowerCase();
      for (const prefix of TRANSIENT_PREFIXES) {
        if (lowered.startsWith(prefix)) {
          found.push({ path, prefix, value: value.slice(0, 120) });
          return;
        }
      }
      return;
    }
    if (Array.isArray(value)) {
      value.forEach((entry, index) => walk(entry, `${path}[${index}]`));
      return;
    }
    if (value && typeof value === 'object') {
      for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
        walk(entry, path === '' ? key : `${path}.${key}`);
      }
    }
  };

  walk(document, '');
  return found;
}

export function assertNoTransientReferences(document: unknown): void {
  const found = findTransientReferences(document);
  if (found.length > 0) {
    throw new PersistenceError(
      'PERSISTENCE_TRANSIENT_REFERENCE',
      `Refusing to persist ${found.length} transient media reference(s): ${found
        .slice(0, 4)
        .map((entry) => `${entry.path}=${entry.prefix}…`)
        .join(', ')}`,
      { references: found.map((entry) => `${entry.path}=${entry.prefix}`) },
    );
  }
}

/** Every asset a document depends on, de-duplicated, in document order. */
export function collectDocumentAssetIds(document: ProjectDocumentV2): AssetId[] {
  const ids = new Set<AssetId>();
  for (const track of document.project.tracks) {
    for (const clip of track.clips) {
      for (const id of collectClipAssetIds(clip as ClipLike)) ids.add(id);
    }
  }
  for (const entry of document.exports ?? []) {
    if (entry.assetId) ids.add(entry.assetId);
  }
  return [...ids];
}

/** Track/clip order must match the fingerprint recorded when the document was written. */
export function assertOrderFingerprint(document: ProjectDocumentV2, fingerprint: string): void {
  if (document.schemaVersion !== PROJECT_SCHEMA_VERSION) return;
  const actual = computeOrderFingerprint(document.project?.tracks ?? []);
  if (actual !== fingerprint) {
    throw new PersistenceError(
      'PERSISTENCE_CORRUPT',
      'Project document track/clip ordering does not match its stored fingerprint.',
    );
  }
}

/**
 * Internal consistency of a document, independent of how it was transported.
 * Shared by the envelope reader and the bundle importer so a portable file gets
 * exactly the same guarantees as the IndexedDB copy.
 */
export function assertDocumentInternals(document: ProjectDocumentV2): void {
  if (document.schemaVersion !== PROJECT_SCHEMA_VERSION) return;
  if (!Array.isArray(document.project?.tracks)) {
    throw new PersistenceError('PERSISTENCE_CORRUPT', 'Project document has no tracks array.');
  }
  const recomputed = calculateProjectDuration(document.project.tracks);
  if (Math.abs(recomputed - document.project.totalDuration) > 1e-6) {
    throw new PersistenceError(
      'PERSISTENCE_CORRUPT',
      `Project document duration ${document.project.totalDuration}s does not match its timeline (${recomputed}s).`,
    );
  }
}

/** Wraps a document with checksum + provenance. */
export async function sealDocument(
  document: ProjectDocumentV2,
  meta: { projectId: string; name: string; revision: number; savedAt: number; migratedFrom?: number },
): Promise<DocumentEnvelope> {
  const json = canonicalJson(document);
  const { algorithm, checksum } = await checksumOf(document);
  const envelope: DocumentEnvelope = {
    envelopeVersion: ENVELOPE_VERSION,
    projectId: meta.projectId,
    name: meta.name,
    revision: meta.revision,
    savedAt: meta.savedAt,
    schemaVersion: document.schemaVersion,
    algorithm,
    checksum,
    byteLength: new TextEncoder().encode(json).length,
    orderFingerprint: computeOrderFingerprint(document.project.tracks),
    duration: document.project.totalDuration,
    ...(meta.migratedFrom !== undefined ? { migratedFrom: meta.migratedFrom } : {}),
    document,
  };
  return envelope;
}

export interface OpenedEnvelope {
  readonly envelope: DocumentEnvelope;
  readonly document: ProjectDocumentV2;
}

/**
 * Opens a stored envelope and verifies it end to end:
 *   parse → schemaVersion supported → checksum → order fingerprint → duration.
 *
 * Any failure throws `PERSISTENCE_CORRUPT` / `PERSISTENCE_UNSUPPORTED_VERSION`;
 * it never returns a partially hydrated document (no silent data loss).
 */
export async function openEnvelope(raw: unknown): Promise<OpenedEnvelope> {
  if (!raw || typeof raw !== 'object') {
    throw new PersistenceError('PERSISTENCE_CORRUPT', 'Stored project envelope is missing or not an object.');
  }

  const candidate = raw as Partial<DocumentEnvelope>;
  const document = candidate.document;
  if (!document || typeof document !== 'object') {
    throw new PersistenceError('PERSISTENCE_CORRUPT', 'Stored project envelope has no document payload.');
  }

  const schemaVersion = (document as { schemaVersion?: unknown }).schemaVersion;
  if (typeof schemaVersion !== 'number' || !(SUPPORTED_SCHEMA_VERSIONS as readonly number[]).includes(schemaVersion)) {
    throw new PersistenceError(
      'PERSISTENCE_UNSUPPORTED_VERSION',
      `Project document version ${String(schemaVersion)} is not supported by this build (supported: ${SUPPORTED_SCHEMA_VERSIONS.join(', ')}).`,
      { foundVersion: schemaVersion, supportedVersions: SUPPORTED_SCHEMA_VERSIONS },
    );
  }

  if (typeof candidate.checksum === 'string') {
    const ok = await verifyChecksum(document, {
      algorithm: (candidate.algorithm ?? 'sha-256') as ChecksumAlgorithm,
      checksum: candidate.checksum,
    });
    if (!ok) {
      throw new PersistenceError('PERSISTENCE_CORRUPT', 'Project document failed its integrity checksum.');
    }
  }

  const v2 = document as ProjectDocumentV2;

  if (typeof candidate.orderFingerprint === 'string') {
    assertOrderFingerprint(v2, candidate.orderFingerprint);
  }
  assertDocumentInternals(v2);

  if (
    v2.schemaVersion === PROJECT_SCHEMA_VERSION &&
    typeof candidate.duration === 'number' &&
    Array.isArray(v2.project?.tracks)
  ) {
    const recomputed = calculateProjectDuration(v2.project.tracks);
    if (Math.abs(candidate.duration - recomputed) > 1e-6) {
      throw new PersistenceError('PERSISTENCE_CORRUPT', 'Project envelope duration does not match its document.');
    }
  }

  return { envelope: candidate as DocumentEnvelope, document: v2 };
}

/** Convenience reader for callers that already have JSON text. */
export async function openEnvelopeFromJson(raw: string): Promise<OpenedEnvelope> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new PersistenceError('PERSISTENCE_CORRUPT', 'Stored project is not valid JSON.', { cause: error });
  }
  return openEnvelope(parsed);
}

/** Detects whether a clip still carries a runtime-only media handle. */
export function clipHasRuntimeMediaHandle(clip: ClipLike): boolean {
  const reference = readClipMediaReference(clip);
  return Object.keys(reference.transientUrls).length > 0 || Object.keys(reference.inlineDataUrls).length > 0;
}
