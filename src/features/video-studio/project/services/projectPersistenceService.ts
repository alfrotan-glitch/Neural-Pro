/**
 * Project persistence coordinator (WP-05).
 *
 * This is the single app-facing entry point for durable state. It composes:
 *
 *   AssetRegistry        bytes + identity + object-URL ownership   (IndexedDB)
 *   ProjectDocumentStore atomic, checksummed, recoverable documents (IndexedDB)
 *   SHIM-001             V1/localStorage → V2 migration
 *   UiPreferencesStore   the only localStorage consumer (UI prefs)
 *
 * Guarantees this module is responsible for:
 *   - Save → Reload → Continue restores the SAME project: identity, track/clip
 *     order, durations, selection and settings.
 *   - No blob:/data:/file: reference is ever written (R1) — transient handles are
 *     imported as assets, or the clip is explicitly marked unresolved.
 *   - A save never reports success while media is unrecoverable (INV-010): it
 *     returns warnings and the UI shows them.
 *   - A crash mid-save leaves the previous document intact (atomic transaction).
 *   - A corrupt document is reported, never silently replaced by an empty one.
 */

import type { ProjectState, Track } from '../types/project';
import { assertValidProjectState, normalizeSelectedNodeIds } from '../validation';
import { calculateProjectDuration, clampProjectTime } from '../../../../core/engine/projectDuration';
import type { AssetId, AssetRecord, MediaProbe } from '../../../../domain/assets/types';
import {
  clipExpectsMedia,
  collectClipAssetIds,
  collectImportableMediaUrls,
  markClipMediaMissing,
  readClipMediaReference,
  type ClipLike,
  type RuntimeMediaBinding,
} from '../../../../domain/assets/mediaReferences';
import type { AssetRegistry } from '../../../../domain/assets/AssetRegistry';
import {
  ProjectDocumentStore,
  type LoadDocumentResult,
  type ProjectSummary,
} from '../../../../infra/persistence/projectDocumentStore';
import {
  collectDocumentAssetIds,
  serializeProjectDocument,
  PROJECT_SCHEMA_VERSION,
  type ExportRecordEntry,
  type PersistedProjectState,
  type ProjectDocumentV2,
  type ProjectSettings,
} from '../../../../infra/persistence/documentContract';
import { migrateV1toV2, SHIM_001_ID } from '../../../../infra/persistence/migrateV1toV2';
import {
  createTransientMediaImporter,
  type TransientMediaImporter,
} from '../../../../infra/persistence/transientMediaImporter';
import {
  hydrateProjectMedia,
  releaseProjectMedia,
  type MediaMissingWarning,
} from '../../../../infra/persistence/mediaHydration';
import {
  createIndexedDbAssetRegistry,
} from '../../../../infra/persistence/IndexedDbAssetRegistry';
import {
  createMemoryAssetRegistry,
  createMemoryKeyValueBackend,
} from '../../../../infra/persistence/memoryBackend';
import {
  createIndexedDbKeyValueBackend,
  isIndexedDbAvailable,
  openNeuralProDatabase,
} from '../../../../infra/persistence/indexedDbBackend';
import { createUiPreferencesStore, type UiPreferences, type UiPreferencesStore } from '../../../../infra/persistence/uiPreferencesStore';
import {
  collectOrphanedAssets,
  describeStorageCapability,
  estimateStorage,
  type StorageCapabilityReport,
} from '../../../../infra/persistence/storageLifecycle';
import { PersistenceError, asPersistenceError, isPersistenceError } from '../../../../infra/persistence/errors';
import { checksumOf } from '../../../../infra/persistence/integrity';
import {
  exportProjectBundle,
  importProjectBundle,
  BUNDLE_EXTENSION,
} from '../../../../infra/persistence/projectBundle';
import type { StorageEstimate } from '../../../../domain/assets/AssetRegistry';

export { PROJECT_SCHEMA_VERSION, BUNDLE_EXTENSION };
export type { MediaMissingWarning, ProjectSettings, ExportRecordEntry, ProjectSummary };

const LEGACY_NAMED_PREFIX = 'video_studio_pro_project_';
const LEGACY_VERSIONED_PREFIX = 'video_studio_pro_project_v1_';
const LEGACY_GLOBAL_KEY = 'video_studio_pro_saved_project';

export type PersistenceStorageMode = 'durable' | 'session';

export interface PersistenceRuntime {
  readonly registry: AssetRegistry;
  readonly documents: ProjectDocumentStore;
  readonly preferences: UiPreferencesStore;
  readonly importer: TransientMediaImporter;
  readonly storageMode: PersistenceStorageMode;
  readonly storageReason: string | null;
  readonly capability: StorageCapabilityReport;
  releaseAllMediaHandles(): number;
}

let runtimePromise: Promise<PersistenceRuntime> | null = null;
let activeBindings: RuntimeMediaBinding[] = [];

export interface RuntimeOverrides {
  readonly registry?: AssetRegistry;
  readonly documents?: ProjectDocumentStore;
  readonly preferences?: UiPreferencesStore;
  readonly importer?: TransientMediaImporter;
  readonly storageMode?: PersistenceStorageMode;
  readonly storageReason?: string | null;
  readonly capability?: StorageCapabilityReport;
}

/**
 * Lazily builds the production runtime. Falls back to a session-scoped runtime
 * when IndexedDB is unavailable, and says so through `storageMode`/`storageReason`
 * — degradation is never silent.
 */
export async function createPersistenceRuntime(overrides: RuntimeOverrides = {}): Promise<PersistenceRuntime> {
  let registry = overrides.registry ?? null;
  let documents = overrides.documents ?? null;
  let storageMode: PersistenceStorageMode = overrides.storageMode ?? 'durable';
  let storageReason = overrides.storageReason ?? null;

  if (!registry || !documents) {
    if (isIndexedDbAvailable()) {
      try {
        const db = await openNeuralProDatabase();
        documents = documents ?? new ProjectDocumentStore(createIndexedDbKeyValueBackend(db));
        const documentStore = documents;
        registry = registry ?? (await createIndexedDbAssetRegistry({
          database: db,
          referenceProvider: () => collectAllReferencedAssetIds(documentStore),
        }));
      } catch (error) {
        storageMode = 'session';
        storageReason = `IndexedDB could not be opened (${describeMessage(error)}); the project survives this session only.`;
      }
    } else {
      storageMode = 'session';
      storageReason = 'IndexedDB is unavailable in this browsing context; the project survives this session only.';
    }
  }

  documents = documents ?? new ProjectDocumentStore(createMemoryKeyValueBackend());
  const resolvedDocuments = documents;
  registry = registry ?? createMemoryAssetRegistry({
    referenceProvider: () => collectAllReferencedAssetIds(resolvedDocuments),
  });

  const capability = overrides.capability ?? (await describeStorageCapability());
  const importer = overrides.importer ?? createTransientMediaImporter({ registry });

  return {
    registry,
    documents,
    preferences: overrides.preferences ?? createUiPreferencesStore(),
    importer,
    storageMode: overrides.storageMode ?? (storageMode === 'durable' && capability.mode === 'durable' ? 'durable' : 'session'),
    storageReason: storageReason ?? capability.reason,
    capability,
    releaseAllMediaHandles() {
      const released = releaseProjectMedia(registry!, activeBindings);
      activeBindings = [];
      return released + registry!.releaseAll();
    },
  };
}

export function getPersistenceRuntime(): Promise<PersistenceRuntime> {
  if (!runtimePromise) {
    runtimePromise = createPersistenceRuntime();
  }
  return runtimePromise;
}

/** Test seam: drops the singleton so the next call builds a fresh runtime. */
export function resetPersistenceRuntime(): void {
  runtimePromise = null;
  activeBindings = [];
}

export function setPersistenceRuntimeForTests(runtime: PersistenceRuntime | null): void {
  runtimePromise = runtime ? Promise.resolve(runtime) : null;
  activeBindings = [];
}

export function getActiveMediaBindings(): readonly RuntimeMediaBinding[] {
  return activeBindings;
}

function describeMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function legacyStorageKeys(projectName: string): string[] {
  return [
    `${LEGACY_VERSIONED_PREFIX}${encodeURIComponent(projectName.trim())}`,
    `${LEGACY_NAMED_PREFIX}${projectName}`,
    LEGACY_GLOBAL_KEY,
  ];
}

/**
 * Imports any transient media handle still present in the tracks.
 *
 * The runtime copy KEEPS its object URL (so playback in this session is not
 * interrupted) and gains the durable `AssetId`; serialisation strips the URL
 * later. A handle that no longer resolves is removed and the clip is marked
 * durably unresolved — never silently left pointing at nothing.
 */
export async function importRuntimeMediaHandles(
  tracks: readonly Track[],
  importer: TransientMediaImporter | null,
): Promise<{ tracks: Track[]; warnings: MediaMissingWarning[]; importedAssetIds: AssetId[] }> {
  const warnings: MediaMissingWarning[] = [];
  const importedAssetIds: AssetId[] = [];

  const nextTracks: Track[] = [];
  for (const track of tracks) {
    const nextClips: Track['clips'] = [];
    for (const clip of track.clips ?? []) {
      const properties: Record<string, unknown> = { ...(clip.properties ?? {}) };
      const reference = readClipMediaReference(clip as ClipLike);
      const entries = collectImportableMediaUrls(reference);
      let mutated = false;

      for (const { urlKey, url } of entries) {
        const resolvedKey =
          urlKey === 'fileUrl'
            ? track.type === 'audio'
              ? 'audioAssetId'
              : 'videoAssetId'
            : urlKey === 'audioUrl'
              ? 'audioAssetId'
              : urlKey === 'imageUrl'
                ? 'imageAssetId'
                : 'videoAssetId';

        // Already durable through another key? Then just drop the handle.
        if (typeof properties[resolvedKey] === 'string' && (properties[resolvedKey] as string).length > 0) {
          continue;
        }

        const imported = importer
          ? await importer.importUrl(url, {
              clipId: clip.id,
              fileName: typeof properties.mediaFileName === 'string' ? properties.mediaFileName : null,
              mimeType: typeof properties.mediaMimeType === 'string' ? properties.mediaMimeType : null,
              kind: resolvedKey === 'audioAssetId' ? 'audio' : resolvedKey === 'imageAssetId' ? 'image' : 'video',
            })
          : null;

        mutated = true;
        if (imported) {
          properties[resolvedKey] = imported.assetId;
          properties.mediaMimeType = imported.record.mimeType;
          if (!properties.mediaFileName && imported.record.source.type === 'file') {
            properties.mediaFileName = imported.record.source.fileName;
          }
          importedAssetIds.push(imported.assetId);
        } else {
          delete properties[urlKey];
          markClipMediaMissing(properties, 'TRANSIENT_URL_UNRESOLVED', {
            durable: true,
            originalName: typeof properties.name === 'string' ? properties.name : null,
          });
          warnings.push({
            clipId: clip.id,
            trackId: track.id,
            clipName: typeof properties.name === 'string' ? properties.name : clip.id,
            assetId: null,
            reason: 'TRANSIENT_URL_UNRESOLVED',
            message: `The media for "${String(properties.name ?? clip.id)}" could not be captured; the clip is kept but marked as needing a relink.`,
          });
        }
      }

      nextClips.push(mutated ? { ...clip, properties } : clip);
    }
    nextTracks.push({ ...track, clips: nextClips });
  }

  return { tracks: nextTracks, warnings, importedAssetIds };
}

export interface SaveProjectInput {
  readonly projectId: string;
  readonly name: string;
  readonly state: ProjectState;
  readonly settings?: ProjectSettings;
  readonly exports?: readonly ExportRecordEntry[];
  readonly runtime?: PersistenceRuntime;
  /** Skip orphan collection (tests, or an explicit user-triggered sweep). */
  readonly skipGarbageCollection?: boolean;
  readonly migratedFrom?: number;
}

export interface SaveProjectResult {
  readonly ok: boolean;
  readonly projectId: string;
  readonly revision: number;
  readonly savedAt: number;
  readonly byteLength: number;
  readonly checksum: string;
  readonly warnings: MediaMissingWarning[];
  readonly importedAssetIds: AssetId[];
  readonly assets: readonly AssetRecord[];
  /** Tracks with durable asset ids attached (runtime URLs preserved). */
  readonly normalizedTracks: Track[];
  readonly storageMode: PersistenceStorageMode;
  readonly degraded: boolean;
  readonly estimate: StorageEstimate;
  readonly error: PersistenceError | null;
}

/**
 * Saves the project durably.
 *
 * Never throws for a "the user should know" condition: missing media, degraded
 * storage and quota pressure are reported in the result so the UI can say what
 * actually happened instead of showing a green "Saved".
 */
/**
 * Every AssetId referenced by ANY stored project, plus any extras supplied by the
 * caller (the document about to be saved, which is not in the index yet).
 *
 * The asset store is shared across projects, so "orphaned" can only ever be
 * decided against all of them. Scoping this to the project being saved would mark
 * every other project's media as garbage — the grace window merely delayed the
 * deletion by a week.
 *
 * Returns `null` when any document could not be read: with an unknown reference
 * set, nothing may be deleted.
 */
export async function collectAllReferencedAssetIds(
  documents: ProjectDocumentStore,
  extra: Iterable<AssetId> = [],
): Promise<ReadonlySet<AssetId> | null> {
  const referenced = new Set<AssetId>(extra);
  const summaries = await documents.list();
  for (const summary of summaries) {
    const loaded = await documents.load(summary.projectId);
    if (!loaded.found || !loaded.document) return null;
    for (const assetId of collectDocumentAssetIds(loaded.document)) referenced.add(assetId);
  }
  return referenced;
}

export interface ReclaimableMedia {
  readonly count: number;
  readonly bytes: number;
}

/**
 * How much space unreferenced media is holding.
 *
 * The scope is every stored project (see `collectAllReferencedAssetIds`); the count
 * is `0` when the reference set cannot be established, because promising space that
 * cannot safely be freed is worse than reporting none.
 */
export async function describeReclaimableMedia(runtime?: PersistenceRuntime): Promise<ReclaimableMedia> {
  const resolved = runtime ?? (await getPersistenceRuntime());
  const referenced = await collectAllReferencedAssetIds(resolved.documents);
  if (!referenced) return { count: 0, bytes: 0 };

  // Computed from the records directly rather than via `registry.orphaned()`, so
  // the answer does not depend on how the registry was constructed.
  let bytes = 0;
  let count = 0;
  for (const record of await resolved.registry.list()) {
    if (referenced.has(record.id)) continue;
    count += 1;
    bytes += record.byteSize;
  }
  return { count, bytes };
}

export interface EvictMediaResult {
  readonly ok: boolean;
  readonly removed: AssetId[];
  readonly removedBytes: number;
  readonly estimate: StorageEstimate;
  readonly error: PersistenceError | null;
}

/**
 * Frees space on explicit user action.
 *
 * Unlike the automatic post-save collection this ignores the grace window — the
 * user asked for the space back — but it still refuses to run when the reference
 * set is unknown, and it never touches media any stored project refers to.
 */
export async function evictUnreferencedMedia(runtime?: PersistenceRuntime): Promise<EvictMediaResult> {
  const resolved = runtime ?? (await getPersistenceRuntime());
  const referenced = await collectAllReferencedAssetIds(resolved.documents);
  if (!referenced) {
    return {
      ok: false,
      removed: [],
      removedBytes: 0,
      estimate: await estimateStorage(),
      error: new PersistenceError(
        'PERSISTENCE_CORRUPT',
        'A stored project could not be read, so nothing was deleted: its media references are unknown.',
      ),
    };
  }

  try {
    const result = await collectOrphanedAssets({ registry: resolved.registry, referenced, force: true });
    return {
      ok: true,
      removed: result.removed,
      removedBytes: result.removedBytes,
      estimate: await estimateStorage(),
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      removed: [],
      removedBytes: 0,
      estimate: await estimateStorage(),
      error: asPersistenceError(error, 'Eviction failed'),
    };
  }
}

export async function saveProject(input: SaveProjectInput): Promise<SaveProjectResult> {
  const runtime = input.runtime ?? (await getPersistenceRuntime());
  const estimate = await estimateStorage();
  const degraded = runtime.storageMode === 'session';

  const fail = (error: PersistenceError, warnings: MediaMissingWarning[] = []): SaveProjectResult => ({
    ok: false,
    projectId: input.projectId,
    revision: 0,
    savedAt: 0,
    byteLength: 0,
    checksum: '',
    warnings,
    importedAssetIds: [],
    assets: [],
    normalizedTracks: input.state.tracks,
    storageMode: runtime.storageMode,
    degraded,
    estimate,
    error,
  });

  const imported = await importRuntimeMediaHandles(input.state.tracks, runtime.importer);
  const warnings: MediaMissingWarning[] = [...imported.warnings];

  const normalizedState: ProjectState = {
    ...input.state,
    tracks: imported.tracks,
    totalDuration: calculateProjectDuration(imported.tracks),
  };

  try {
    assertValidProjectState({
      ...normalizedState,
      currentTime: clampProjectTime(normalizedState.currentTime, normalizedState.totalDuration),
      isPlaying: false,
      selectedNodeIds: normalizeSelectedNodeIds(imported.tracks, normalizedState.selectedNodeIds),
    });
  } catch (error) {
    return fail(asPersistenceError(error, 'Refusing to save an invalid project state'), warnings);
  }

  // Resolve the manifest: every referenced asset must have a record.
  const referencedIds = collectReferencedAssetIds(imported.tracks, input.exports ?? []);
  const assets: AssetRecord[] = [];
  for (const assetId of referencedIds) {
    const record = await runtime.registry.getRecord(assetId);
    if (record) {
      assets.push(record);
      continue;
    }
    warnings.push({
      clipId: '',
      trackId: '',
      clipName: null,
      assetId,
      reason: 'ASSET_MISSING',
      message: `Asset ${assetId} is referenced but has no record in this browser profile.`,
    });
  }

  let document: ProjectDocumentV2;
  try {
    document = serializeProjectDocument({
      projectId: input.projectId,
      name: input.name,
      state: {
        ...normalizedState,
        currentTime: clampProjectTime(normalizedState.currentTime, normalizedState.totalDuration),
        isPlaying: false,
        selectedNodeIds: normalizeSelectedNodeIds(imported.tracks, normalizedState.selectedNodeIds),
      },
      assets,
      settings: input.settings ?? {},
      exports: input.exports ?? [],
    });
  } catch (error) {
    return fail(asPersistenceError(error, 'Project serialisation failed'), warnings);
  }

  try {
    const saved = await runtime.documents.save(document, {
      ...(input.migratedFrom !== undefined ? { migratedFrom: input.migratedFrom } : {}),
    });

    if (!input.skipGarbageCollection) {
      // Deferred and best-effort: reclaiming space must never fail a save.
      // The scope is every stored project, not just this one — see
      // collectAllReferencedAssetIds. An unknown scope reclaims nothing.
      void (async () => {
        const referenced = await collectAllReferencedAssetIds(runtime.documents, referencedIds);
        if (!referenced) return;
        await collectOrphanedAssets({ registry: runtime.registry, referenced });
      })().catch(() => undefined);
    }

    return {
      ok: true,
      projectId: saved.projectId,
      revision: saved.revision,
      savedAt: saved.savedAt,
      byteLength: saved.byteLength,
      checksum: saved.checksum,
      warnings,
      importedAssetIds: imported.importedAssetIds,
      assets,
      normalizedTracks: imported.tracks,
      storageMode: runtime.storageMode,
      degraded,
      estimate,
      error: null,
    };
  } catch (error) {
    const typed = asPersistenceError(error, `Failed to save project ${input.projectId}`);
    if (typed.code === 'PERSISTENCE_QUOTA') {
      const orphans = await runtime.registry.orphaned();
      return {
        ...fail(typed, warnings),
        estimate: await estimateStorage(),
        // Surface the eviction option without performing it silently.
        warnings: [
          ...warnings,
          {
            clipId: '',
            trackId: '',
            clipName: null,
            assetId: null,
            reason: 'ASSET_MISSING',
            message: `Storage is full. ${orphans.length} unreferenced asset(s) can be evicted to make room.`,
          },
        ],
      };
    }
    return fail(typed, warnings);
  }
}

/**
 * Derives the durable document key from the project name.
 *
 * The editor's identity is the project name (that is what the UI opens by), while
 * `ProjectState.projectId` is a shared sentinel for every new project. Keying the
 * document by the name keeps two projects with the same default id from writing
 * over each other, and the hash suffix keeps visually similar names distinct.
 */
export async function deriveProjectId(projectName: string): Promise<string> {
  const name = projectName.trim();
  if (name === '') throw new PersistenceError('PERSISTENCE_FAILED', 'A project name is required to save.');
  const { checksum } = await checksumOf({ neuralproProjectName: name.toLowerCase() });
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32);
  return `proj_${slug || 'project'}_${checksum.slice(0, 12)}`;
}

export function collectReferencedAssetIds(
  tracks: readonly Track[],
  exports: readonly ExportRecordEntry[] = [],
): AssetId[] {
  const ids = new Set<AssetId>();
  for (const track of tracks) {
    for (const clip of track.clips ?? []) {
      for (const id of collectClipAssetIds(clip as ClipLike)) ids.add(id);
    }
  }
  for (const entry of exports) {
    if (entry.assetId) ids.add(entry.assetId);
  }
  return [...ids];
}

export interface LoadProjectInput {
  readonly projectId?: string;
  readonly name?: string;
  readonly fallbackState: ProjectState;
  readonly runtime?: PersistenceRuntime;
  /** Read a V1 localStorage save when no V2 document exists (SHIM-001). */
  readonly allowLegacyMigration?: boolean;
  readonly legacyStorage?: Storage | null;
  /** When true, the legacy localStorage keys are removed after a successful migration. */
  readonly removeLegacyKeys?: boolean;
}

export interface LoadProjectResult {
  readonly found: boolean;
  readonly projectId: string;
  readonly state: ProjectState | null;
  readonly settings: ProjectSettings;
  readonly exports: readonly ExportRecordEntry[];
  readonly warnings: MediaMissingWarning[];
  readonly recovered: boolean;
  readonly recoveredFrom: 'rollback' | 'legacy-localStorage' | null;
  readonly revision: number;
  readonly storageMode: PersistenceStorageMode;
  readonly degraded: boolean;
  readonly error: PersistenceError | null;
  readonly migratedFrom: number | null;
}

/**
 * Loads a project and turns durable identity back into playable media.
 *
 * Failure modes are explicit:
 *   - not found                → `found: false`, caller decides (fresh project)
 *   - corrupt + rollback exists→ previous version, `recovered: true`, error attached
 *   - corrupt, no rollback     → `error` set, `state: null` — never an empty project
 *   - unknown schemaVersion    → PERSISTENCE_UNSUPPORTED_VERSION, never guessed
 */
export async function loadProject(input: LoadProjectInput): Promise<LoadProjectResult> {
  const runtime = input.runtime ?? (await getPersistenceRuntime());
  const degraded = runtime.storageMode === 'session';

  const notFound = (error: PersistenceError | null, recoveredFrom: LoadProjectResult['recoveredFrom'] = null): LoadProjectResult => ({
    found: false,
    projectId: input.projectId ?? '',
    state: null,
    settings: {},
    exports: [],
    warnings: [],
    recovered: recoveredFrom !== null,
    recoveredFrom,
    revision: 0,
    storageMode: runtime.storageMode,
    degraded,
    error,
    migratedFrom: null,
  });

  let loaded: LoadDocumentResult | null = null;
  if (input.projectId) loaded = await runtime.documents.load(input.projectId);
  if ((!loaded || !loaded.found) && input.name) loaded = await runtime.documents.loadByName(input.name);

  if (!loaded || !loaded.found || !loaded.document) {
    // SHIM-001: fall back to a V1 localStorage save, migrate it, and persist V2.
    if (input.allowLegacyMigration !== false) {
      const legacy = await migrateLegacyLocalStorage({
        runtime,
        name: input.name ?? '',
        projectId: input.projectId ?? null,
        fallbackState: input.fallbackState,
        storage: input.legacyStorage === undefined ? safeLocalStorage() : input.legacyStorage,
        removeKeys: input.removeLegacyKeys ?? true,
      });
      if (legacy) return legacy;
    }
    return notFound(loaded?.error ?? null);
  }

  const document = loaded.document;
  let project: PersistedProjectState;
  let migratedFrom: number | null = null;
  const migrationWarnings: MediaMissingWarning[] = [];

  if (document.schemaVersion !== PROJECT_SCHEMA_VERSION) {
    const outcome = await migrateV1toV2(
      { schemaVersion: document.schemaVersion, project: (document as unknown as { project?: unknown }).project ?? document },
      {
        projectId: document.projectId || input.fallbackState.projectId,
        name: document.name || input.name || 'Imported Project',
        importer: runtime.importer,
        fallbackState: input.fallbackState,
      },
    );
    project = outcome.project;
    migratedFrom = outcome.sourceSchemaVersion;
    migrationWarnings.push(...outcome.warnings);
  } else {
    project = document.project;
  }

  const hydrated = await hydrateProjectMedia({ tracks: project.tracks, registry: runtime.registry });
  activeBindings = [...activeBindings, ...hydrated.bindings];

  const totalDuration = calculateProjectDuration(hydrated.tracks);
  const state: ProjectState = {
    projectId: project.projectId || input.fallbackState.projectId,
    metadata: project.metadata,
    currentTime: clampProjectTime(project.currentTime ?? 0, totalDuration),
    totalDuration,
    tracks: hydrated.tracks,
    selectedNodeIds: normalizeSelectedNodeIds(hydrated.tracks, project.selectedNodeIds ?? []),
    ...(project.selectedKeyframeIds ? { selectedKeyframeIds: project.selectedKeyframeIds } : {}),
    isPlaying: false,
    ...(project.animations ? { animations: project.animations } : {}),
  };

  try {
    assertValidProjectState(state);
  } catch (error) {
    return {
      ...notFound(asPersistenceError(error, 'Hydrated project failed validation')),
      recovered: loaded.recovered,
      recoveredFrom: loaded.recoveredFrom,
      revision: loaded.revision,
      error: asPersistenceError(error, 'Hydrated project failed validation'),
    };
  }

  return {
    found: true,
    projectId: document.projectId,
    state,
    settings: document.settings ?? {},
    exports: document.exports ?? [],
    warnings: [...migrationWarnings, ...hydrated.warnings],
    recovered: loaded.recovered,
    recoveredFrom: loaded.recoveredFrom,
    revision: loaded.revision,
    storageMode: runtime.storageMode,
    degraded,
    error: loaded.error,
    migratedFrom: loaded.envelope?.migratedFrom ?? migratedFrom,
  };
}

function safeLocalStorage(): Storage | null {
  try {
    return (globalThis as { localStorage?: Storage }).localStorage ?? null;
  } catch {
    return null;
  }
}

interface LegacyMigrationOptions {
  runtime: PersistenceRuntime;
  name: string;
  /** Derived from the project name — the identity the UI actually opens by. */
  projectId: string | null;
  fallbackState: ProjectState;
  storage: Storage | null;
  removeKeys: boolean;
}

/**
 * SHIM-001 entry point for the pre-V2 localStorage shape.
 *
 * The raw V1 JSON is seeded into the durable rollback slot BEFORE the
 * localStorage key is removed, so migrating can never be the operation that
 * loses the user's only copy.
 */
async function migrateLegacyLocalStorage(options: LegacyMigrationOptions): Promise<LoadProjectResult | null> {
  const { storage } = options;
  if (!storage || !options.name) return null;

  const keys = legacyStorageKeys(options.name);
  let raw: string | null = null;
  let matchedKey: string | null = null;
  for (const key of keys) {
    try {
      const value = storage.getItem(key);
      if (value) {
        raw = value;
        matchedKey = key;
        break;
      }
    } catch {
      return null;
    }
  }
  if (!raw || !matchedKey) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new PersistenceError('PERSISTENCE_CORRUPT', 'The saved project in localStorage is not valid JSON.', {
      cause: error,
      key: matchedKey,
    });
  }

  // The caller-derived id wins: legacy documents were written with a shared
  // sentinel projectId, so trusting them would let two projects collide.
  const projectId = options.projectId ?? resolveProjectId(parsed, options.fallbackState.projectId, options.name);
  const outcome = await migrateV1toV2(parsed, {
    projectId,
    name: options.name,
    importer: options.runtime.importer,
    fallbackState: options.fallbackState,
  });

  // Keep the hydrated state's identity equal to the document's identity.
  const migratedProject = { ...outcome.project, projectId };

  const referencedIds = collectReferencedAssetIds(migratedProject.tracks);
  const assets: AssetRecord[] = [];
  for (const assetId of referencedIds) {
    const record = await options.runtime.registry.getRecord(assetId);
    if (record) assets.push(record);
  }

  const document = serializeProjectDocument({
    projectId,
    name: options.name,
    state: { ...migratedProject, isPlaying: false },
    assets,
    settings: {},
    exports: [],
  });

  // Preserve the legacy payload inside the durable store before touching localStorage.
  await options.runtime.documents.seedRollback(projectId, raw);
  const saved = await options.runtime.documents.save(document, { migratedFrom: 1 });

  if (options.removeKeys) {
    for (const key of keys) {
      try {
        storage.removeItem(key);
      } catch {
        /* leave the key; the V2 copy is authoritative now */
      }
    }
  }

  const hydrated = await hydrateProjectMedia({
    tracks: migratedProject.tracks,
    registry: options.runtime.registry,
  });
  activeBindings = [...activeBindings, ...hydrated.bindings];

  const totalDuration = calculateProjectDuration(hydrated.tracks);
  const state: ProjectState = {
    projectId: migratedProject.projectId,
    metadata: migratedProject.metadata,
    currentTime: clampProjectTime(migratedProject.currentTime, totalDuration),
    totalDuration,
    tracks: hydrated.tracks,
    selectedNodeIds: normalizeSelectedNodeIds(hydrated.tracks, migratedProject.selectedNodeIds),
    isPlaying: false,
    ...(migratedProject.animations ? { animations: migratedProject.animations } : {}),
  };
  assertValidProjectState(state);

  return {
    found: true,
    projectId,
    state,
    settings: {},
    exports: [],
    warnings: [...outcome.warnings, ...hydrated.warnings],
    recovered: false,
    recoveredFrom: 'legacy-localStorage',
    revision: saved.revision,
    storageMode: options.runtime.storageMode,
    degraded: options.runtime.storageMode === 'session',
    error: null,
    migratedFrom: 1,
  };
}

function resolveProjectId(parsed: unknown, fallbackProjectId: string, name: string): string {
  const candidate = parsed as { project?: { projectId?: unknown }; projectId?: unknown } | null;
  const fromProject = candidate?.project?.projectId;
  if (typeof fromProject === 'string' && fromProject.trim() !== '') return fromProject;
  if (typeof candidate?.projectId === 'string' && candidate.projectId.trim() !== '') return candidate.projectId;
  if (fallbackProjectId && fallbackProjectId.trim() !== '') return fallbackProjectId;
  return `proj_${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_')}`;
}

export interface RelinkMediaInput {
  readonly clipIds: readonly string[];
  readonly file: File | Blob;
  readonly fileName: string;
  readonly mimeType: string;
  readonly tracks: readonly Track[];
  readonly runtime?: PersistenceRuntime;
}

export interface RelinkMediaResult {
  readonly tracks: Track[];
  readonly assetId: AssetId;
  readonly record: AssetRecord;
  readonly objectUrl: string;
  readonly warnings: MediaMissingWarning[];
}

/**
 * Relinks media for one or more clips (the recovery affordance for a
 * `mediaMissing` clip, and the mechanism behind "Link/Replace media").
 *
 * Per contract media-assets §4, replacement also re-derives the clip's duration
 * and trim from the NEW asset's measured duration, so the timeline cannot claim
 * time the media does not have.
 */
export async function relinkClipMedia(input: RelinkMediaInput): Promise<RelinkMediaResult> {
  const runtime = input.runtime ?? (await getPersistenceRuntime());
  const blob = input.file as Blob;
  const probe = await runtime.registry.probeFrom(blob, input.mimeType || blob.type || 'application/octet-stream');
  const assetId = await runtime.registry.put(blob, {
    kind: probe.kind,
    mimeType: probe.mimeType || input.mimeType,
    name: input.fileName,
    duration: probe.duration,
    width: probe.width,
    height: probe.height,
    sampleRate: probe.sampleRate,
    channels: probe.channels,
    source: { type: 'file', fileName: input.fileName },
    role: 'source',
  });
  const record = (await runtime.registry.getRecord(assetId))!;
  const objectUrl = await runtime.registry.resolveUrl(assetId);
  activeBindings.push({ clipId: input.clipIds[0] ?? '', urlKey: 'videoUrl', assetId, url: objectUrl });

  const requested = new Set(input.clipIds);
  const warnings: MediaMissingWarning[] = [];

  const tracks = input.tracks.map((track) => ({
    ...track,
    clips: track.clips.map((clip) => {
      if (!requested.has(clip.id)) return clip;
      const properties: Record<string, unknown> = { ...clip.properties };
      const key = track.type === 'audio' ? 'audioAssetId' : probe.kind === 'image' ? 'imageAssetId' : 'videoAssetId';
      const urlKey = key === 'audioAssetId' ? 'audioUrl' : key === 'imageAssetId' ? 'imageUrl' : 'videoUrl';
      properties[key] = assetId;
      properties[urlKey] = objectUrl;
      properties.fileUrl = objectUrl;
      properties.mediaFileName = input.fileName;
      properties.mediaMimeType = record.mimeType;
      properties.mediaLinkedAt = new Date().toISOString();
      delete properties.mediaMissing;
      delete properties.mediaMissingReason;
      delete properties.mediaUnresolved;
      delete properties.mediaUnresolvedReason;

      let next = { ...clip, properties, name: input.fileName };
      if (record.duration !== null && record.duration > 0) {
        const duration = Math.max(0.05, record.duration);
        next = {
          ...next,
          duration,
          trim: { in: 0, out: duration },
        };
      } else {
        warnings.push({
          clipId: clip.id,
          trackId: track.id,
          clipName: input.fileName,
          assetId,
          reason: 'ASSET_MISSING',
          message: `Duration of "${input.fileName}" could not be measured; the existing clip length was kept.`,
        });
      }
      return next;
    }),
  }));

  return { tracks, assetId, record, objectUrl, warnings };
}

export interface ImportMediaFileResult {
  readonly assetId: AssetId;
  readonly record: AssetRecord;
  readonly objectUrl: string;
}

/**
 * Imports a user-picked file as a durable asset.
 *
 * Returns a runtime object URL for immediate playback AND the AssetId that must
 * be written into the clip. The bytes are in IndexedDB before this resolves, so
 * a save performed one millisecond later is already durable.
 */
export async function importMediaFile(options: {
  file: File | Blob;
  fileName?: string;
  mimeType?: string;
  runtime?: PersistenceRuntime;
}): Promise<ImportMediaFileResult> {
  const runtime = options.runtime ?? (await getPersistenceRuntime());
  const blob = options.file as Blob;
  const fileName = (options.file as File).name ?? options.fileName ?? 'imported-media';
  const mimeType = options.mimeType || (options.file as File).type || blob.type || 'application/octet-stream';
  const probe = await runtime.registry.probeFrom(blob, mimeType);
  const assetId = await runtime.registry.put(blob, {
    kind: probe.kind,
    mimeType: probe.mimeType || mimeType,
    name: fileName,
    duration: probe.duration,
    width: probe.width,
    height: probe.height,
    sampleRate: probe.sampleRate,
    channels: probe.channels,
    source: { type: 'file', fileName },
    role: 'source',
  });
  const record = (await runtime.registry.getRecord(assetId))!;
  const objectUrl = await runtime.registry.resolveUrl(assetId);
  activeBindings.push({ clipId: '', urlKey: 'videoUrl', assetId, url: objectUrl });
  return { assetId, record, objectUrl };
}

/** Registers generated media (extracted audio, rendered output) as a durable asset. */
export async function registerGeneratedMedia(options: {
  blob: Blob;
  fileName: string;
  mimeType: string;
  producer: string;
  jobId?: string;
  role?: 'generated' | 'export';
  runtime?: PersistenceRuntime;
  /** Measurement the caller already performed (e.g. decodeAudioData during extraction). */
  measured?: Partial<MediaProbe>;
}): Promise<{ assetId: AssetId; record: AssetRecord; objectUrl: string }> {
  const runtime = options.runtime ?? (await getPersistenceRuntime());
  const probe = { ...(await runtime.registry.probeFrom(options.blob, options.mimeType)), ...(options.measured ?? {}) };
  const assetId = await runtime.registry.put(options.blob, {
    kind: probe.kind,
    mimeType: probe.mimeType || options.mimeType,
    name: options.fileName,
    duration: probe.duration,
    width: probe.width,
    height: probe.height,
    sampleRate: probe.sampleRate,
    channels: probe.channels,
    source: { type: 'generated', producer: options.producer, ...(options.jobId ? { jobId: options.jobId } : {}) },
    role: options.role ?? 'generated',
  });
  const record = (await runtime.registry.getRecord(assetId))!;
  const objectUrl = await runtime.registry.resolveUrl(assetId);
  return { assetId, record, objectUrl };
}

/**
 * Registers generated media that currently exists only as a browser-local URL
 * (for example the podcast audio produced by the AI workflow) as a durable
 * asset. Returns `null` when the handle no longer resolves.
 */
export async function registerGeneratedMediaFromUrl(options: {
  url: string;
  fileName: string;
  producer: string;
  mimeType?: string;
  jobId?: string;
  role?: 'generated' | 'export';
  runtime?: PersistenceRuntime;
}): Promise<{ assetId: AssetId; record: AssetRecord; objectUrl: string } | null> {
  let blob: Blob;
  try {
    const response = await fetch(options.url);
    if (!response.ok) return null;
    blob = await response.blob();
  } catch {
    return null;
  }
  if (!blob || blob.size === 0) return null;
  return registerGeneratedMedia({
    blob,
    fileName: options.fileName,
    mimeType: options.mimeType || blob.type || 'application/octet-stream',
    producer: options.producer,
    jobId: options.jobId,
    role: options.role,
    runtime: options.runtime,
  });
}

export async function listProjects(runtime?: PersistenceRuntime): Promise<ProjectSummary[]> {
  const resolved = runtime ?? (await getPersistenceRuntime());
  return resolved.documents.list();
}

export async function deleteProject(projectId: string, runtime?: PersistenceRuntime): Promise<void> {
  const resolved = runtime ?? (await getPersistenceRuntime());
  await resolved.documents.remove(projectId);
}

/**
 * Revokes every object URL minted for the active project.
 * Call on project close / component unmount / page unload so a long editing
 * session cannot accumulate leaked media handles (INV-008).
 */
export async function releaseProjectMediaHandles(): Promise<number> {
  const bindings = activeBindings;
  activeBindings = [];
  if (!runtimePromise) return 0;
  const runtime = await runtimePromise;
  // Count both stages: the URLs this session minted for clips, plus anything the
  // registry is still tracking. Under-reporting here would hide a leak.
  const releasedBindings = releaseProjectMedia(runtime.registry, bindings);
  const releasedRemaining = runtime.registry.releaseAll();
  return releasedBindings + releasedRemaining;
}

export interface UnresolvedMediaClip {
  readonly clipId: string;
  readonly trackId: string;
  readonly clipName: string | null;
}

/**
 * Synchronous scan for clips that cannot render.
 *
 * A clip is unresolved when it is flagged (this session or durably) or when it
 * expects media but holds neither an `AssetId` nor a remote URL. Export uses
 * this to refuse to start rather than painting placeholders (contract §8).
 */
export function findUnresolvedMediaClips(tracks: readonly Track[]): UnresolvedMediaClip[] {
  const unresolved: UnresolvedMediaClip[] = [];

  for (const track of tracks) {
    for (const clip of track.clips ?? []) {
      const properties = (clip.properties ?? {}) as Record<string, unknown>;
      const reference = readClipMediaReference(clip as ClipLike);
      const flagged = properties.mediaMissing === true || properties.mediaUnresolved === true;
      const hasDurableMedia =
        Boolean(reference.videoAssetId) ||
        Boolean(reference.audioAssetId) ||
        Boolean(reference.imageAssetId) ||
        Object.keys(reference.remoteUrls).length > 0;
      const expectsMedia =
        clipExpectsMedia(clip as ClipLike) || properties.mediaOriginalName !== undefined;

      if (flagged || (expectsMedia && !hasDurableMedia)) {
        unresolved.push({
          clipId: clip.id,
          trackId: track.id,
          clipName:
            typeof properties.mediaOriginalName === 'string'
              ? properties.mediaOriginalName
              : typeof properties.name === 'string'
                ? properties.name
                : clip.id,
        });
      }
    }
  }

  return unresolved;
}

/* ------------------------------------------------------------- bundles */

export interface ExportBundleInput {
  readonly projectId: string;
  readonly runtime?: PersistenceRuntime;
}

export interface ExportBundleOutcome {
  readonly ok: boolean;
  readonly blob: Blob | null;
  readonly fileName: string;
  readonly byteSize: number;
  readonly assetCount: number;
  readonly warnings: MediaMissingWarning[];
  readonly missingAssets: readonly AssetId[];
  readonly storageMode: PersistenceStorageMode;
  readonly error: PersistenceError | null;
}

/**
 * Produces a `.neuralpro` file: the project document plus the bytes of every
 * asset it references.
 *
 * This is the durability path that does not depend on the browser profile at all —
 * it survives a cleared profile, a partitioned/private frame, storage eviction and
 * a move to another machine. It is a real second copy of the project, not a
 * metadata-only export.
 */
export async function exportProjectBundleFile(input: ExportBundleInput): Promise<ExportBundleOutcome> {
  const runtime = input.runtime ?? (await getPersistenceRuntime());
  try {
    const result = await exportProjectBundle({
      projectId: input.projectId,
      registry: runtime.registry,
      documents: runtime.documents,
    });
    return {
      ok: true,
      blob: result.blob,
      fileName: result.fileName,
      byteSize: result.byteSize,
      assetCount: result.assetCount,
      warnings: result.warnings,
      missingAssets: result.missingAssets,
      storageMode: runtime.storageMode,
      error: null,
    };
  } catch (error) {
    return {
      ok: false,
      blob: null,
      fileName: '',
      byteSize: 0,
      assetCount: 0,
      warnings: [],
      missingAssets: [],
      storageMode: runtime.storageMode,
      error: asPersistenceError(error, 'Project bundle could not be created'),
    };
  }
}

export interface ImportBundleInput {
  readonly file: Blob;
  readonly fallbackState: ProjectState;
  /** Import under a different name (defaults to the name stored in the bundle). */
  readonly projectName?: string;
  readonly runtime?: PersistenceRuntime;
}

export interface ImportBundleOutcome {
  readonly ok: boolean;
  readonly projectId: string;
  readonly name: string;
  readonly state: ProjectState | null;
  readonly settings: ProjectSettings;
  readonly exports: readonly ExportRecordEntry[];
  readonly warnings: MediaMissingWarning[];
  readonly restoredAssets: readonly AssetId[];
  readonly reusedAssets: readonly AssetId[];
  readonly missingAssets: readonly AssetId[];
  readonly revision: number;
  readonly storageMode: PersistenceStorageMode;
  readonly degraded: boolean;
  readonly error: PersistenceError | null;
}

/**
 * Restores a `.neuralpro` bundle into this profile.
 *
 * Asset bytes land first, the document last and atomically — so a failure partway
 * through leaves no half-imported project behind, only unused bytes that the orphan
 * collector reclaims. The read path after the write is the same `loadProject` used
 * for a normal open, which means an imported project is hydrated, validated and
 * warning-reported by exactly the code that runs on every other load.
 */
export async function importProjectBundleFile(input: ImportBundleInput): Promise<ImportBundleOutcome> {
  const runtime = input.runtime ?? (await getPersistenceRuntime());
  const degraded = runtime.storageMode === 'session';

  const failure = (error: PersistenceError): ImportBundleOutcome => ({
    ok: false,
    projectId: '',
    name: '',
    state: null,
    settings: {},
    exports: [],
    warnings: [],
    restoredAssets: [],
    reusedAssets: [],
    missingAssets: [],
    revision: 0,
    storageMode: runtime.storageMode,
    degraded,
    error,
  });

  let imported;
  try {
    imported = await importProjectBundle({
      blob: input.file,
      registry: runtime.registry,
      documents: runtime.documents,
      projectName: input.projectName,
    });
  } catch (error) {
    return failure(asPersistenceError(error, 'Project bundle could not be read'));
  }

  const loaded = await loadProject({
    projectId: imported.projectId,
    fallbackState: input.fallbackState,
    runtime,
    // A bundle is always V2; never let this path wander into legacy migration.
    allowLegacyMigration: false,
  });

  if (!loaded.found || !loaded.state) {
    return {
      ...failure(loaded.error ?? new PersistenceError('PERSISTENCE_CORRUPT', 'The imported bundle could not be re-opened.')),
      projectId: imported.projectId,
      name: imported.name,
      warnings: imported.warnings,
      restoredAssets: imported.restoredAssets,
      reusedAssets: imported.reusedAssets,
      missingAssets: imported.missingAssets,
      revision: imported.revision,
    };
  }

  return {
    ok: true,
    projectId: imported.projectId,
    name: imported.name,
    state: loaded.state,
    settings: loaded.settings,
    exports: loaded.exports,
    warnings: [...imported.warnings, ...loaded.warnings],
    restoredAssets: imported.restoredAssets,
    reusedAssets: imported.reusedAssets,
    missingAssets: imported.missingAssets,
    revision: loaded.revision,
    storageMode: loaded.storageMode,
    degraded: loaded.degraded,
    error: loaded.error,
  };
}

export { collectOrphanedAssets, isPersistenceError, SHIM_001_ID };
export type { AssetRegistry, AssetRecord, AssetId, RuntimeMediaBinding, UiPreferences, ProjectDocumentV2 };
